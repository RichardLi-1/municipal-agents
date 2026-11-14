// Small geometry helpers in WGS84 (lng, lat). Distances are great-circle metres.

export type LngLat = [number, number];

const R = 6371008.8;
const RAD = Math.PI / 180;

export function distM(a: LngLat, b: LngLat): number {
  const dLat = (b[1] - a[1]) * RAD;
  const dLng = (b[0] - a[0]) * RAD;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function round5(x: number): number {
  return Math.round(x * 1e5) / 1e5;
}

export function roundPt(p: LngLat): LngLat {
  return [round5(p[0]), round5(p[1])];
}

function inRing(p: LngLat, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function inPolygon(p: LngLat, rings: number[][][]): boolean {
  if (!rings.length || !inRing(p, rings[0])) return false;
  for (let k = 1; k < rings.length; k++) if (inRing(p, rings[k])) return false;
  return true;
}

/** Polygons (as ring lists) of a GeoJSON geometry; points and lines give none. */
export function polygonsOf(geom: GeoJSON.Geometry | null | undefined): number[][][][] {
  if (!geom) return [];
  if (geom.type === "Polygon") return [geom.coordinates as number[][][]];
  if (geom.type === "MultiPolygon") return geom.coordinates as number[][][][];
  if (geom.type === "GeometryCollection") return geom.geometries.flatMap((g) => polygonsOf(g));
  return [];
}

export function pointsOf(geom: GeoJSON.Geometry | null | undefined): LngLat[] {
  if (!geom) return [];
  if (geom.type === "Point") return [geom.coordinates as LngLat];
  if (geom.type === "MultiPoint") return geom.coordinates as LngLat[];
  if (geom.type === "GeometryCollection") return geom.geometries.flatMap((g) => pointsOf(g));
  return [];
}

export type BBox = [number, number, number, number]; // minLng, minLat, maxLng, maxLat

export function bboxOf(polys: number[][][][]): BBox {
  const b: BBox = [Infinity, Infinity, -Infinity, -Infinity];
  for (const poly of polys)
    for (const pt of poly[0]) {
      if (pt[0] < b[0]) b[0] = pt[0];
      if (pt[1] < b[1]) b[1] = pt[1];
      if (pt[0] > b[2]) b[2] = pt[0];
      if (pt[1] > b[3]) b[3] = pt[1];
    }
  return b;
}

/** Area-weighted centroid of a polygon's outer ring (planar approximation, fine at city scale). */
export function ringCentroid(ring: number[][]): LngLat {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    a += f;
    cx += (ring[j][0] + ring[i][0]) * f;
    cy += (ring[j][1] + ring[i][1]) * f;
  }
  if (Math.abs(a) < 1e-14) {
    const n = ring.length;
    return [ring.reduce((s, p) => s + p[0], 0) / n, ring.reduce((s, p) => s + p[1], 0) / n];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

/** An area to test points against: polygons, or circles around points. */
export interface AreaMask {
  id: string;
  label: string;
  bbox: BBox;
  contains: (p: LngLat) => boolean;
}

/** Build a mask from a GeoJSON Feature/FeatureCollection; points become circles of radiusM. */
export function areaMask(id: string, label: string, area: GeoJSON.Feature | GeoJSON.FeatureCollection, radiusM: number): AreaMask {
  const feats = area.type === "FeatureCollection" ? area.features : [area];
  const polys = feats.flatMap((f) => polygonsOf(f.geometry));
  const pts = feats.flatMap((f) => pointsOf(f.geometry));
  const bbox = polys.length ? bboxOf(polys) : ([Infinity, Infinity, -Infinity, -Infinity] as BBox);
  for (const p of pts) {
    const dLat = radiusM / 111_320;
    const dLng = radiusM / (111_320 * Math.cos(p[1] * RAD));
    bbox[0] = Math.min(bbox[0], p[0] - dLng);
    bbox[1] = Math.min(bbox[1], p[1] - dLat);
    bbox[2] = Math.max(bbox[2], p[0] + dLng);
    bbox[3] = Math.max(bbox[3], p[1] + dLat);
  }
  const polyBoxes = polys.map((p) => bboxOf([p]));
  return {
    id,
    label,
    bbox,
    contains: (p: LngLat) => {
      if (p[0] < bbox[0] || p[0] > bbox[2] || p[1] < bbox[1] || p[1] > bbox[3]) return false;
      for (let k = 0; k < polys.length; k++) {
        const b = polyBoxes[k];
        if (p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3] && inPolygon(p, polys[k])) return true;
      }
      for (const c of pts) if (distM(p, c) <= radiusM) return true;
      return false;
    },
  };
}

/** A spatial hash for "which points are within r metres". */
export interface PointIndex {
  near: (p: LngLat, radiusM: number) => number[];
}

export function pointIndex(points: LngLat[], cellM = 400): PointIndex {
  const lat0 = points.length ? points[0][1] : 43.5;
  const dLat = cellM / 111_320;
  const dLng = cellM / (111_320 * Math.cos(lat0 * RAD));
  const cells = new Map<string, number[]>();
  points.forEach((p, i) => {
    const k = `${Math.floor(p[0] / dLng)},${Math.floor(p[1] / dLat)}`;
    let arr = cells.get(k);
    if (!arr) cells.set(k, (arr = []));
    arr.push(i);
  });
  return {
    near: (p: LngLat, radiusM: number) => {
      const out: number[] = [];
      const cx = Math.floor(p[0] / dLng), cy = Math.floor(p[1] / dLat);
      const span = Math.ceil(radiusM / cellM) + 1;
      for (let x = cx - span; x <= cx + span; x++)
        for (let y = cy - span; y <= cy + span; y++) {
          const arr = cells.get(`${x},${y}`);
          if (!arr) continue;
          for (const i of arr) if (distM(p, points[i]) <= radiusM) out.push(i);
        }
      return out;
    },
  };
}

/** Square cell polygon centred on p with side sideM. */
export function squareAround(p: LngLat, sideM: number): number[][][] {
  const h = sideM / 2;
  const dLat = h / 111_320;
  const dLng = h / (111_320 * Math.cos(p[1] * RAD));
  const r = (x: number) => Math.round(x * 1e4) / 1e4; // 4 decimals (about 10 m) is plenty for a 400 m square
  return [[
    [r(p[0] - dLng), r(p[1] - dLat)],
    [r(p[0] + dLng), r(p[1] - dLat)],
    [r(p[0] + dLng), r(p[1] + dLat)],
    [r(p[0] - dLng), r(p[1] + dLat)],
    [r(p[0] - dLng), r(p[1] - dLat)],
  ]];
}
