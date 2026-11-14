// Geometry for the construction scout, in WGS84 [lng, lat]. Distances in metres.
// Over a few kilometres a local flat projection (equirectangular about a reference
// latitude) is accurate to well under 0.1%, which is plenty for site scouting.

export type LngLat = [number, number];

const R = 6371008.8; // mean Earth radius, m
const RAD = Math.PI / 180;

/** Great-circle distance (haversine), metres. */
export function distM(a: LngLat, b: LngLat): number {
  const dLat = (b[1] - a[1]) * RAD;
  const dLng = (b[0] - a[0]) * RAD;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** A local metric frame about a reference point: x east, y north, metres. */
export interface Frame {
  toXY(p: LngLat): [number, number];
  toLngLat(xy: [number, number]): LngLat;
}

export function frameAt(ref: LngLat): Frame {
  const kx = R * RAD * Math.cos(ref[1] * RAD);
  const ky = R * RAD;
  return {
    toXY: (p) => [(p[0] - ref[0]) * kx, (p[1] - ref[1]) * ky],
    toLngLat: ([x, y]) => [ref[0] + x / kx, ref[1] + y / ky],
  };
}

/** Area of a ring (or a polygon's outer ring minus holes), square metres. */
export function ringAreaM2(ring: LngLat[] | number[][]): number {
  if (ring.length < 3) return 0;
  const f = frameAt(ring[0] as LngLat);
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = f.toXY(ring[i] as LngLat);
    const [xj, yj] = f.toXY(ring[j] as LngLat);
    s += xj * yi - xi * yj;
  }
  return Math.abs(s) / 2;
}

export function polygonAreaM2(rings: number[][][]): number {
  if (!rings.length) return 0;
  return Math.max(0, ringAreaM2(rings[0]) - rings.slice(1).reduce((a, r) => a + ringAreaM2(r), 0));
}

/** Area-weighted centroid of a ring. */
export function ringCentroid(ring: number[][]): LngLat {
  const f = frameAt(ring[0] as LngLat);
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = f.toXY(ring[i] as LngLat);
    const [xj, yj] = f.toXY(ring[j] as LngLat);
    const k = xj * yi - xi * yj;
    a += k;
    cx += (xi + xj) * k;
    cy += (yi + yj) * k;
  }
  if (Math.abs(a) < 1e-9) return ring[0] as LngLat;
  return f.toLngLat([cx / (3 * a), cy / (3 * a)]);
}

export function pointInRing(p: LngLat, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(p: LngLat, rings: number[][][]): boolean {
  if (!rings.length || !pointInRing(p, rings[0])) return false;
  for (let k = 1; k < rings.length; k++) if (pointInRing(p, rings[k])) return false;
  return true;
}

/** Cumulative chainage (metres) at each vertex of a line. */
export function chainages(line: LngLat[]): number[] {
  const out = [0];
  for (let i = 1; i < line.length; i++) out.push(out[i - 1] + distM(line[i - 1], line[i]));
  return out;
}

export function lineLengthM(line: LngLat[]): number {
  const c = chainages(line);
  return c[c.length - 1];
}

/** The nearest point on a line to p: its chainage, the distance and the point. */
export function projectOnLine(p: LngLat, line: LngLat[]): { chainageM: number; distanceM: number; point: LngLat } {
  const f = frameAt(p);
  const ch = chainages(line);
  let best = { chainageM: 0, distanceM: Infinity, point: line[0] };
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, ay] = f.toXY(line[i]);
    const [bx, by] = f.toXY(line[i + 1]);
    const dx = bx - ax, dy = by - ay;
    const L2 = dx * dx + dy * dy;
    const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L2));
    const x = ax + t * dx, y = ay + t * dy;
    const d = Math.hypot(x, y);
    if (d < best.distanceM) best = { chainageM: ch[i] + t * (ch[i + 1] - ch[i]), distanceM: d, point: f.toLngLat([x, y]) };
  }
  return best;
}

/** Distance from p to the nearest segment of any of the lines (metres). */
export function distToLines(p: LngLat, lines: LngLat[][]): number {
  let d = Infinity;
  for (const l of lines) if (l.length > 1) d = Math.min(d, projectOnLine(p, l).distanceM);
  return d;
}

/** Distance from p to a polygon: 0 inside, else to its outer ring. */
export function distToPolygon(p: LngLat, rings: number[][][]): number {
  if (pointInPolygon(p, rings)) return 0;
  return projectOnLine(p, rings[0] as LngLat[]).distanceM;
}

/** Point at a chainage along the line, with the direction of travel (degrees from north). */
export function pointAt(line: LngLat[], chainageM: number): { point: LngLat; bearing: number } {
  const ch = chainages(line);
  const c = Math.max(0, Math.min(ch[ch.length - 1], chainageM));
  let i = 0;
  while (i < line.length - 2 && ch[i + 1] < c) i++;
  const seg = ch[i + 1] - ch[i];
  const t = seg === 0 ? 0 : (c - ch[i]) / seg;
  const f = frameAt(line[i]);
  const [bx, by] = f.toXY(line[i + 1]);
  return { point: f.toLngLat([bx * t, by * t]), bearing: (Math.atan2(bx, by) / RAD + 360) % 360 };
}

/** The part of a line between two chainages. */
export function sliceLine(line: LngLat[], fromM: number, toM: number): LngLat[] {
  const ch = chainages(line);
  const out: LngLat[] = [pointAt(line, fromM).point];
  for (let i = 0; i < line.length; i++) if (ch[i] > fromM && ch[i] < toM) out.push(line[i]);
  out.push(pointAt(line, toM).point);
  return out;
}

/** A line shifted sideways: positive offset to the right of the direction of travel. */
export function offsetLine(line: LngLat[], offsetM: number): LngLat[] {
  const f = frameAt(line[0]);
  const xy = line.map((p) => f.toXY(p));
  const normal = (i: number): [number, number] => {
    const a = xy[Math.max(0, i - 1)], b = xy[Math.min(xy.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const L = Math.hypot(dx, dy) || 1;
    return [dy / L, -dx / L]; // right-hand normal
  };
  return xy.map((p, i) => {
    const [nx, ny] = normal(i);
    return f.toLngLat([p[0] + nx * offsetM, p[1] + ny * offsetM]);
  });
}

/** A rectangle (closed ring) centred on a point, long side along a bearing. */
export function rectangle(center: LngLat, bearingDeg: number, lengthM: number, widthM: number): LngLat[] {
  const f = frameAt(center);
  const b = bearingDeg * RAD;
  const ux = Math.sin(b), uy = Math.cos(b); // along
  const vx = uy, vy = -ux; // across
  const corners: [number, number][] = [
    [-lengthM / 2, -widthM / 2],
    [lengthM / 2, -widthM / 2],
    [lengthM / 2, widthM / 2],
    [-lengthM / 2, widthM / 2],
  ];
  const ring = corners.map(([a, c]) => f.toLngLat([a * ux + c * vx, a * uy + c * vy]));
  return [...ring, ring[0]];
}

/** Douglas-Peucker simplification with a tolerance in metres. */
export function simplify(line: LngLat[], tolM: number): LngLat[] {
  if (line.length < 3) return line.slice();
  const f = frameAt(line[0]);
  const xy = line.map((p) => f.toXY(p));
  const keep = new Uint8Array(line.length);
  keep[0] = keep[line.length - 1] = 1;
  const stack: [number, number][] = [[0, line.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = xy[a], [bx, by] = xy[b];
    const dx = bx - ax, dy = by - ay;
    const L = Math.hypot(dx, dy) || 1;
    let best = -1, bi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * xy[i][0] - dx * xy[i][1] + bx * ay - by * ax) / L;
      if (d > best) (best = d), (bi = i);
    }
    if (best > tolM) {
      keep[bi] = 1;
      stack.push([a, bi], [bi, b]);
    }
  }
  return line.filter((_, i) => keep[i]);
}

export function round5(x: number): number {
  return Math.round(x * 1e5) / 1e5;
}

export function roundPt(p: LngLat | number[]): LngLat {
  return [round5(p[0]), round5(p[1])];
}

/** Round every coordinate in a geometry to 5 decimals (about 1 m). */
export function roundGeometry<G extends GeoJSON.Geometry>(g: G): G {
  const r = (c: unknown): unknown => (Array.isArray(c) && typeof c[0] === "number" ? roundPt(c as number[]) : Array.isArray(c) ? c.map(r) : c);
  if (g.type === "GeometryCollection") return { ...g, geometries: g.geometries.map(roundGeometry) };
  return { ...g, coordinates: r((g as GeoJSON.Point).coordinates) } as G;
}

/** Linear ramp: 0 at `zero`, 1 at `one` (either order), clamped. */
export function ramp(x: number, zero: number, one: number): number {
  if (zero === one) return x >= one ? 1 : 0;
  return Math.max(0, Math.min(1, (x - zero) / (one - zero)));
}
