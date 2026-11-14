import { useEffect, useRef } from "preact/hooks";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { createStore, useStore } from "../lib/store.ts";
import { effectiveTheme, reducedMotion, systemDark, themePref } from "../lib/prefs.ts";
import type { CameraFocus, ExtraLayers } from "../lib/construction.ts";

export type LayerKind = "access" | "stops" | "destinations" | "gaps" | "projects" | "generic";

export interface MapLayer {
  id: string;
  label: string;
  kind: LayerKind;
  data: GeoJSON.FeatureCollection;
  visible: boolean;
}

export interface MapPin {
  id: string;
  at: [number, number];
  label: string;
  sub?: string;
  selected?: boolean;
  /** Lifted this many rows above its point, on a leader line, when pins crowd. */
  stack?: number;
  onClick?: () => void;
}

export interface MapState {
  areas: { id: string; geo: GeoJSON.Feature | GeoJSON.FeatureCollection; selected?: boolean }[];
  pins: MapPin[];
  layers: MapLayer[];
  /** Change the key to move the camera. */
  focus?: { key: string; center: [number, number]; zoom: number; fit?: boolean };
  onAreaClick?: (id: string) => void;
  /** Ready-made MapLibre sources and layers (the construction lens), drawn on top. */
  extra?: ExtraLayers & { visible?: string[] | null };
}

export const mapState = createStore<MapState>({ areas: [], pins: [], layers: [] });

let mapInstance: maplibregl.Map | null = null;
let pulseMarker: maplibregl.Marker | null = null;

const STYLE = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};

const COLORS = {
  light: { accent: "#1f5fd6", ink: "#0b0d10", paper: "#ffffff", warn: "#d9480f", soft: "#8fb0ee", pale: "#b9cdf5" },
  dark: { accent: "#82abff", ink: "#f2f4f7", paper: "#15181d", warn: "#ff8a4c", soft: "#5b84d6", pale: "#34508f" },
};

/** Space covered by the panes, so the camera centres things in the visible part. */
function coverPadding() {
  const pad = { top: 80, bottom: 40, left: 40, right: 40 };
  if (innerWidth < 900) return { top: 30, bottom: 50, left: 30, right: 30 };
  const l = document.querySelector("[data-cover=left]")?.getBoundingClientRect();
  const r = document.querySelector("[data-cover=right]")?.getBoundingClientRect();
  if (l) pad.left = l.right + 40;
  if (r) pad.right = innerWidth - r.left + 40;
  return pad;
}

function bboxOf(geo: GeoJSON.GeoJSON): [[number, number], [number, number]] | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const visit = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === "number") {
      const [x, y] = c as number[];
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    } else if (Array.isArray(c)) c.forEach(visit);
  };
  const walk = (g: GeoJSON.GeoJSON): void => {
    if (g.type === "FeatureCollection") g.features.forEach(walk);
    else if (g.type === "Feature") g.geometry && walk(g.geometry);
    else if (g.type === "GeometryCollection") g.geometries.forEach(walk);
    else visit((g as GeoJSON.Point).coordinates);
  };
  walk(geo);
  return Number.isFinite(minX) ? [[minX, minY], [maxX, maxY]] : null;
}

export const mapApi = {
  flyTo(center: [number, number], zoom = 15.5) {
    const m = mapInstance;
    if (!m) return;
    const opts = { center, zoom, padding: coverPadding() };
    if (reducedMotion.get()) m.jumpTo(opts);
    else m.flyTo({ ...opts, duration: 1100, essential: true });
  },
  pulse(at: [number, number] | null) {
    pulseMarker?.remove();
    pulseMarker = null;
    if (!at || !mapInstance) return;
    const el = document.createElement("div");
    el.className = "map-pulse";
    el.setAttribute("aria-hidden", "true");
    pulseMarker = new maplibregl.Marker({ element: el }).setLngLat(at).addTo(mapInstance);
  },
  /** Camera move with optional bearing and pitch (construction steps). */
  focus(f: CameraFocus) {
    const m = mapInstance;
    if (!m) return;
    const opts = { center: f.center, zoom: f.zoom, bearing: f.bearing ?? 0, pitch: f.pitch ?? 0, padding: coverPadding() };
    if (reducedMotion.get()) m.jumpTo(opts);
    else m.flyTo({ ...opts, duration: 1600, essential: true });
  },
  resize() {
    mapInstance?.resize();
  },
};

function features(geo: GeoJSON.Feature | GeoJSON.FeatureCollection): GeoJSON.Feature[] {
  return geo.type === "FeatureCollection" ? geo.features : [geo];
}

/** Minutes to the place the access layer shows: our sample's "minutes", or the lens's hospital times. */
const MINUTES = ["coalesce", ["get", "minutes"], ["get", "hospital_w8"], ["get", "grocery_w8"], 99] as unknown as maplibregl.ExpressionSpecification;
const FREQUENT = ["any", ["==", ["get", "frequent"], true], ["<=", ["coalesce", ["get", "h_w8"], 99], 15]] as unknown as maplibregl.ExpressionSpecification;
const POLY = ["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false] as unknown as maplibregl.FilterSpecification;
const POINT = ["match", ["geometry-type"], ["Point", "MultiPoint"], true, false] as unknown as maplibregl.FilterSpecification;
const LINE = ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false] as unknown as maplibregl.FilterSpecification;

function setSource(map: maplibregl.Map, id: string, data: GeoJSON.FeatureCollection) {
  const src = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
  if (src) src.setData(data);
  else map.addSource(id, { type: "geojson", data });
}

function addLayer(map: maplibregl.Map, spec: maplibregl.LayerSpecification) {
  if (!map.getLayer(spec.id)) map.addLayer(spec);
}

function lensLayers(id: string, kind: LayerKind, c: (typeof COLORS)["light"]): maplibregl.LayerSpecification[] {
  const src = `ma-l-${id}`;
  switch (kind) {
    case "access":
      return [
        {
          id: `${src}-fill`,
          type: "fill",
          source: src,
          filter: POLY,
          paint: {
            "fill-color": ["step", MINUTES, c.accent, 20, c.soft, 30, c.pale, 45, c.warn],
            "fill-opacity": ["interpolate", ["linear"], ["zoom"], 10, 0.35, 13, 0.3, 14, 0.14, 14.6, 0],
            "fill-antialias": false,
          },
        },
        {
          id: `${src}-pt`,
          type: "circle",
          source: src,
          filter: POINT,
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 3, 12, 5, 14, 7],
            "circle-color": ["step", MINUTES, c.accent, 20, c.soft, 30, c.pale, 45, c.warn],
            "circle-opacity": ["interpolate", ["linear"], ["zoom"], 10, 0.5, 14, 0.25, 14.6, 0],
            "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], 13, 1, 14.6, 0],
            "circle-stroke-color": c.paper,
            "circle-stroke-width": 1,
          },
        },
      ];
    case "stops":
      return [
        {
          id: `${src}-c`,
          type: "circle",
          source: src,
          filter: POINT,
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, ["case", FREQUENT, 3.5, 2.2], 14, ["case", FREQUENT, 7, 5]],
            "circle-color": c.paper,
            "circle-stroke-color": c.accent,
            "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 10, 1.2, 14, ["case", FREQUENT, 3.5, 2.5]],
          },
        },
      ];
    case "destinations":
      return [
        {
          id: `${src}-c`,
          type: "circle",
          source: src,
          filter: POINT,
          paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 2.5, 14, 5.5], "circle-color": c.ink, "circle-stroke-color": c.paper, "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 10, 0.8, 14, 2] },
        },
      ];
    case "gaps":
      return [
        {
          id: `${src}-halo`,
          type: "circle",
          source: src,
          filter: POINT,
          paint: { "circle-radius": 16, "circle-color": c.warn, "circle-opacity": 0.18 },
        },
        {
          id: `${src}-c`,
          type: "circle",
          source: src,
          filter: POINT,
          paint: { "circle-radius": 7, "circle-color": c.warn, "circle-stroke-color": c.paper, "circle-stroke-width": 2.5 },
        },
      ];
    default:
      return [
        { id: `${src}-fill`, type: "fill", source: src, filter: POLY, paint: { "fill-color": c.accent, "fill-opacity": 0.14 } },
        { id: `${src}-line`, type: "line", source: src, filter: LINE, paint: { "line-color": c.accent, "line-width": 2.5 } },
        {
          id: `${src}-c`,
          type: "circle",
          source: src,
          filter: POINT,
          paint: {
            "circle-radius": kind === "projects" ? ["interpolate", ["linear"], ["coalesce", ["get", "units"], 50], 10, 4, 500, 14] : 5,
            "circle-color": c.accent,
            "circle-opacity": 0.75,
            "circle-stroke-color": c.paper,
            "circle-stroke-width": 1.5,
          },
        },
      ];
  }
}

/**
 * The construction lens is the demo's hero: make its bores, shafts and boreholes bold at
 * the overview zoom (a glow under the twin bores, wider lines, bigger dots), in both themes.
 * Applied from here so the lens module stays as its builder wrote it.
 */
function boostConstruction(map: maplibregl.Map, theme: "light" | "dark", ids: Set<string>) {
  const glow = theme === "dark" ? "rgba(130, 171, 255, 0.55)" : "rgba(31, 95, 214, 0.38)";
  const paper = theme === "dark" ? "#1c1917" : "#ffffff";
  const set = (id: string, prop: string, value: unknown) => {
    try {
      if (map.getLayer(id)) map.setPaintProperty(id, prop, value);
    } catch {
      /* a property this layer type doesn't have */
    }
  };
  const zoomed = (pairs: [number, number][]) => ["interpolate", ["linear"], ["zoom"], ...pairs.flat()];
  if (ids.has("cx-bores-line") && map.getLayer("cx-bores-line") && !map.getLayer("ma-cx-bores-glow")) {
    const src = (map.getLayer("cx-bores-line") as unknown as { source: string }).source;
    const filter = map.getFilter("cx-bores-line");
    try {
      map.addLayer(
        {
          id: "ma-cx-bores-glow",
          type: "line",
          source: src,
          ...(filter ? { filter } : {}),
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": glow, "line-width": zoomed([[9, 16], [13, 30], [17, 56]]) as never, "line-blur": zoomed([[9, 6], [17, 14]]) as never },
        },
        ids.has("cx-bores-casing") ? "cx-bores-casing" : "cx-bores-line",
      );
    } catch {
      /* fine without the glow */
    }
  }
  if (map.getLayer("ma-cx-bores-glow")) map.setPaintProperty("ma-cx-bores-glow", "line-color", glow);
  // Follow the visibility the lens's steps chose for the layers these sit under.
  const follow = (mine: string, theirs: string) => {
    if (map.getLayer(mine) && map.getLayer(theirs)) map.setLayoutProperty(mine, "visibility", map.getLayoutProperty(theirs, "visibility") ?? "visible");
  };
  set("cx-bores-casing", "line-width", zoomed([[9, 7], [13, 12], [17, 20]]));
  set("cx-bores-casing", "line-opacity", 1);
  set("cx-bores-line", "line-width", zoomed([[9, 3.5], [13, 6], [17, 10]]));
  set("cx-bores-line", "line-opacity", 1);
  set("cx-alignment-glow", "line-opacity", 0.26);
  set("cx-alignment-glow", "line-width", zoomed([[9, 10], [13, 18], [17, 70]]));
  set("cx-stage2-line", "line-width", zoomed([[9, 2.5], [13, 3.5], [17, 5]]));
  set("cx-stage2-line", "line-opacity", 0.9);
  set("cx-cross-passages-line", "line-width", zoomed([[12, 3], [17, 6]]));
  set("cx-boreholes-dot", "circle-radius", zoomed([[9, 2], [13, 2.8], [15, 4.5], [18, 8]]));
  set("cx-boreholes-dot", "circle-stroke-color", paper);
  set("cx-boreholes-dot", "circle-stroke-width", 1.5);
  set("cx-sensitive-dot", "circle-radius", zoomed([[9, 4.5], [14, 6.5]]));
  set("cx-shafts-extrusion", "fill-extrusion-opacity", 0.95);
  // Shafts are small footprints: ring them so they read at the overview zoom.
  if (ids.has("cx-shafts-extrusion") && map.getLayer("cx-shafts-extrusion") && !map.getLayer("ma-cx-shafts-ring")) {
    const src = (map.getLayer("cx-shafts-extrusion") as unknown as { source: string }).source;
    try {
      map.addLayer({
        id: "ma-cx-shafts-ring",
        type: "circle",
        source: src,
        maxzoom: 14.5,
        paint: {
          "circle-radius": zoomed([[9, 9], [13, 12], [16, 18]]) as never,
          "circle-color": "rgba(0,0,0,0)",
          "circle-stroke-color": glow.replace(/0\.\d+\)$/, "0.95)"),
          "circle-stroke-width": 3,
        },
      });
    } catch {
      /* polygons without a centre: skip */
    }
  }
  follow("ma-cx-bores-glow", "cx-bores-line");
  follow("ma-cx-shafts-ring", "cx-shafts-extrusion");
}

export function MapView({ hidden }: { hidden: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  const styleReady = useRef(false);
  const pins = useRef(new Map<string, maplibregl.Marker>());
  const extraIds = useRef<{ sources: Set<string>; layers: Set<string> }>({ sources: new Set(), layers: new Set() });
  const lastFocus = useRef<string | undefined>(undefined);
  useStore(themePref);
  useStore(systemDark);
  const theme = effectiveTheme();
  const state = useStore(mapState);

  const apply = () => {
    const map = mapInstance;
    if (!map || !styleReady.current) return;
    const st = mapState.get();
    const c = COLORS[effectiveTheme()];
    // Decision areas.
    setSource(map, "ma-areas", {
      type: "FeatureCollection",
      features: st.areas.flatMap((a) =>
        features(a.geo).map((f) => ({ ...f, properties: { ...(f.properties ?? {}), _id: a.id, _sel: a.selected ? 1 : 0 } })),
      ),
    });
    addLayer(map, {
      id: "ma-areas-fill",
      type: "fill",
      source: "ma-areas",
      filter: POLY,
      paint: { "fill-color": c.accent, "fill-opacity": ["case", ["==", ["get", "_sel"], 1], 0.1, 0.06] },
    });
    addLayer(map, {
      id: "ma-areas-line",
      type: "line",
      source: "ma-areas",
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": c.accent,
        "line-width": ["case", ["==", ["get", "_sel"], 1], 3.5, ["match", ["geometry-type"], ["LineString", "MultiLineString"], 5, 2]],
        "line-opacity": ["case", ["==", ["get", "_sel"], 1], 1, 0.75],
      },
    });
    addLayer(map, {
      id: "ma-areas-halo",
      type: "circle",
      source: "ma-areas",
      filter: POINT,
      paint: { "circle-radius": 28, "circle-color": c.accent, "circle-opacity": ["case", ["==", ["get", "_sel"], 1], 0.18, 0.1] },
    });
    addLayer(map, {
      id: "ma-areas-dot",
      type: "circle",
      source: "ma-areas",
      filter: POINT,
      paint: { "circle-radius": 9, "circle-color": c.accent, "circle-stroke-color": c.paper, "circle-stroke-width": 3 },
    });
    // Lens layers.
    const wanted = new Set<string>();
    for (const l of st.layers) {
      const src = `ma-l-${l.id}`;
      setSource(map, src, l.data);
      for (const spec of lensLayers(l.id, l.kind, c)) {
        wanted.add(spec.id);
        addLayer(map, spec);
        map.setLayoutProperty(spec.id, "visibility", l.visible ? "visible" : "none");
      }
    }
    for (const layer of map.getStyle().layers ?? []) {
      if (layer.id.startsWith("ma-l-") && !wanted.has(layer.id)) map.removeLayer(layer.id);
    }
    // Ready-made layers (construction lens), on top of everything else.
    const ex = st.extra;
    const wantSrc = new Set(Object.keys(ex?.sources ?? {}));
    const wantLay = new Set((ex?.layers ?? []).map((l) => l.id));
    if (!ex) for (const id of ["ma-cx-bores-glow", "ma-cx-shafts-ring"]) if (map.getLayer(id)) map.removeLayer(id);
    for (const id of extraIds.current.layers) if (!wantLay.has(id) && map.getLayer(id)) map.removeLayer(id);
    for (const id of extraIds.current.sources) if (!wantSrc.has(id) && map.getSource(id)) map.removeSource(id);
    if (ex) {
      try {
        for (const [id, spec] of Object.entries(ex.sources)) {
          const cur = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
          if (cur && spec.type === "geojson" && "setData" in cur) cur.setData(spec.data as GeoJSON.GeoJSON);
          else if (!cur) map.addSource(id, spec);
        }
        for (const spec of ex.layers) {
          if (!map.getLayer(spec.id)) map.addLayer(spec);
          if (ex.visible?.length) {
            const src = typeof (spec as { source?: unknown }).source === "string" ? (spec as { source: string }).source : "";
            const on = ex.visible.some((n) => spec.id === n || src === n || spec.id.startsWith(n) || src.startsWith(n));
            map.setLayoutProperty(spec.id, "visibility", on ? "visible" : "none");
          } else map.setLayoutProperty(spec.id, "visibility", "visible");
        }
      } catch (e) {
        console.error("Could not add construction layers", e);
      }
    }
    if (ex) boostConstruction(map, effectiveTheme(), wantLay);
    extraIds.current = { sources: wantSrc, layers: wantLay };
    // Pins (HTML markers: styled with the rest of the interface).
    const seen = new Set<string>();
    for (const p of st.pins) {
      seen.add(p.id);
      let m = pins.current.get(p.id);
      if (!m) {
        const node = document.createElement("div");
        node.className = "map-pin";
        node.setAttribute("aria-hidden", "true");
        m = new maplibregl.Marker({ element: node, anchor: "bottom" }).setLngLat(p.at).addTo(map);
        pins.current.set(p.id, m);
      }
      const node = m.getElement();
      node.innerHTML = "";
      const label = document.createElement("span");
      label.className = "map-pin-label";
      label.textContent = p.label;
      node.append(label);
      if (p.sub) {
        const sub = document.createElement("span");
        sub.className = "map-pin-sub";
        sub.textContent = p.sub;
        node.append(sub);
      }
      node.classList.toggle("is-selected", !!p.selected);

      node.onclick = p.onClick ?? null;
      m.setLngLat(p.at);
    }
    for (const [id, m] of pins.current) {
      if (!seen.has(id)) {
        m.remove();
        pins.current.delete(id);
      }
    }
    requestAnimationFrame(declutter);
  };

  /** Crowded pins move aside in screen space, each on a leader line back to its place. */
  const declutter = () => {
    const map = mapInstance;
    if (!map) return;
    const placed: { x: number; y: number; w: number; h: number }[] = [];
    const tries: [number, number][] = [[0, 0], [0, -64], [0, 64], [-1, 0], [1, 0], [-1, -64], [1, -64], [-1, 64], [1, 64], [0, -128], [0, 128]];
    const list = [...pins.current.values()].map((m) => ({ m, p: map.project(m.getLngLat()), el: m.getElement() }));
    list.sort((a, b) => a.p.y - b.p.y);
    for (const { m, p, el } of list) {
      const w = el.offsetWidth || 200;
      const h = (el.offsetHeight || 50) + 12;
      let off: [number, number] = [0, 0];
      for (const [tx, ty] of tries) {
        const dx = tx * (w + 12);
        const box = { x: p.x + dx - w / 2, y: p.y + ty - h, w, h };
        const hit = placed.some((q) => box.x < q.x + q.w + 6 && q.x < box.x + box.w + 6 && box.y < q.y + q.h && q.y < box.y + box.h);
        if (!hit) {
          off = [dx, ty];
          placed.push(box);
          break;
        }
      }
      const [dx, dy] = off;
      const moved = dx !== 0 || dy !== 0;
      el.classList.toggle("has-leader", moved);
      if (moved) {
        // From the pin's bottom centre back to its point.
        el.style.setProperty("--leader", `${Math.hypot(dx, dy - 4)}px`);
        el.style.setProperty("--leader-angle", `${Math.atan2(-dy + 4, -dx)}rad`);
      }
      m.setOffset(off);
    }
  };

  const moveCamera = () => {
    const map = mapInstance;
    const f = mapState.get().focus;
    if (!map || !f || f.key === lastFocus.current) return;
    lastFocus.current = f.key;
    const padding = coverPadding();
    const area = mapState.get().areas.find((a) => a.selected);
    const box = f.fit && area ? bboxOf(area.geo) : null;
    const animate = !reducedMotion.get();
    if (box) {
      if (map.getPitch() || map.getBearing()) map.jumpTo({ pitch: 0, bearing: 0 });
      map.fitBounds(box, { padding, maxZoom: f.zoom, duration: animate ? 1400 : 0 });
    } else if (animate) map.flyTo({ center: f.center, zoom: f.zoom, bearing: 0, pitch: 0, padding, duration: 1400, essential: true });
    else map.jumpTo({ center: f.center, zoom: f.zoom, bearing: 0, pitch: 0, padding });
  };

  useEffect(() => {
    if (!el.current) return;
    const st = mapState.get();
    const map = new maplibregl.Map({
      container: el.current,
      style: STYLE[effectiveTheme()],
      center: st.focus?.center ?? [-80.49, 43.44],
      zoom: st.focus?.zoom ?? 10.6,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      fadeDuration: 150,
    });
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    mapInstance = map;
    if (import.meta.env.DEV) (window as unknown as { __maMap: maplibregl.Map }).__maMap = map;
    map.on("style.load", () => {
      styleReady.current = true;
      apply();
      moveCamera();
    });
    map.on("moveend", () => declutter());
    map.on("click", "ma-areas-fill", (e) => {
      const id = e.features?.[0]?.properties?._id;
      if (id) mapState.get().onAreaClick?.(String(id));
    });
    map.on("mouseenter", "ma-areas-fill", () => (map.getCanvas().style.cursor = mapState.get().onAreaClick ? "pointer" : ""));
    map.on("mouseleave", "ma-areas-fill", () => (map.getCanvas().style.cursor = ""));
    const canvas = map.getCanvas();
    canvas.setAttribute("aria-label", "Map of the decision area. Use the arrow keys to move and plus or minus to zoom.");
    const onResize = () => map.resize();
    addEventListener("resize", onResize);
    return () => {
      removeEventListener("resize", onResize);
      map.remove();
      mapInstance = null;
    };
  }, []);

  useEffect(() => {
    const map = mapInstance;
    if (!map) return;
    styleReady.current = false;
    extraIds.current = { sources: new Set(), layers: new Set() };
    map.setStyle(STYLE[theme], { diff: false });
  }, [theme]);

  useEffect(() => {
    apply();
    moveCamera();
  }, [state]);

  useEffect(() => {
    if (!hidden) requestAnimationFrame(() => mapInstance?.resize());
  }, [hidden]);

  return <div class="map" ref={el} hidden={hidden} />;
}
