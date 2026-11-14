// MapLibre sources and layers for the construction scout lens. Every source and layer
// id starts with "cx-<layer name>", so a step's mapFocus.layers (e.g. "cx-bores")
// switches its layers on by prefix. Colours are mid-tones that read on both the light
// and the dark base map.

import type { LayerSpecification, SourceSpecification } from "maplibre-gl";
import type { ConstructionLens } from "../../../shared/types.ts";

export const CX_COLORS = {
  stage2: "#8b8680",
  corridor: "#3b74e6",
  bore: "#2f6bea",
  boreCasing: "#ffffff",
  shaft: "#1f5fd6",
  shaftTop: "#163f8f",
  site: ["#f3d9a6", "#e7a647", "#2f9e6a"] as const, // low, mid, high score
  siteEdge: "#7a4a06",
  proposedEdge: "#14110f",
  borehole: "#e0812b",
  crossPassage: "#ffffff",
  sensitive: "#e5484d",
  label: "#1c1917",
  halo: "#ffffff",
};

const FONT = ["Noto Sans Regular"];
const FONT_BOLD = ["Noto Sans Bold"];

function isDark(): boolean {
  if (typeof document === "undefined") return false;
  const t = document.documentElement.dataset.theme;
  if (t === "dark" || t === "light") return t === "dark";
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
}

export function constructionMapLayers(lens: ConstructionLens): { sources: Record<string, SourceSpecification>; layers: LayerSpecification[] } {
  const dark = isDark();
  const ink = dark ? "#f5f5f4" : CX_COLORS.label;
  const halo = dark ? "#1c1917" : CX_COLORS.halo;
  const sources: Record<string, SourceSpecification> = {};
  for (const [name, data] of Object.entries(lens.layers ?? {})) sources[`cx-${name}`] = { type: "geojson", data };
  const has = (name: string) => Boolean(sources[`cx-${name}`]);
  const c = CX_COLORS;
  const layers: LayerSpecification[] = [];

  if (has("stage2"))
    layers.push({
      id: "cx-stage2-line",
      type: "line",
      source: "cx-stage2",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": c.stage2, "line-width": ["interpolate", ["linear"], ["zoom"], 11, 2, 16, 4], "line-opacity": 0.75, "line-dasharray": [1, 1.6] },
    });

  if (has("sites")) {
    layers.push({
      id: "cx-sites-fill",
      type: "fill",
      source: "cx-sites",
      paint: {
        "fill-color": ["interpolate", ["linear"], ["get", "score"], 40, c.site[0], 60, c.site[1], 80, c.site[2]],
        "fill-opacity": ["case", ["get", "proposed"], 0.62, 0.42],
      },
    });
    layers.push({
      id: "cx-sites-edge",
      type: "line",
      source: "cx-sites",
      paint: {
        "line-color": ["case", ["get", "proposed"], c.proposedEdge, c.siteEdge],
        "line-width": ["case", ["get", "proposed"], 2.4, 1],
        "line-dasharray": ["case", ["get", "proposed"], ["literal", [1, 0]], ["literal", [2, 1.5]]],
        "line-opacity": 0.9,
      },
    });
    layers.push({
      id: "cx-sites-label",
      type: "symbol",
      source: "cx-sites",
      minzoom: 14.2,
      layout: {
        "text-field": ["concat", ["to-string", ["get", "score"]], ""],
        "text-font": FONT_BOLD,
        "text-size": 12,
        "text-allow-overlap": false,
      },
      paint: { "text-color": ink, "text-halo-color": halo, "text-halo-width": 1.6 },
    });
  }

  if (has("alignment"))
    layers.push({
      id: "cx-alignment-glow",
      type: "line",
      source: "cx-alignment",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": c.corridor, "line-opacity": 0.16, "line-width": ["interpolate", ["exponential", 2], ["zoom"], 12, 6, 17, 60], "line-blur": 2 },
    });

  if (has("bores")) {
    layers.push({
      id: "cx-bores-casing",
      type: "line",
      source: "cx-bores",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": c.boreCasing, "line-opacity": 0.85, "line-width": ["interpolate", ["exponential", 2], ["zoom"], 12, 2.5, 17, 9] },
    });
    layers.push({
      id: "cx-bores-line",
      type: "line",
      source: "cx-bores",
      layout: { "line-join": "round" },
      paint: { "line-color": c.bore, "line-width": ["interpolate", ["exponential", 2], ["zoom"], 12, 1.6, 17, 5], "line-dasharray": [2.2, 1.2] },
    });
  }

  if (has("cross-passages"))
    layers.push({
      id: "cx-cross-passages-line",
      type: "line",
      source: "cx-cross-passages",
      minzoom: 13.5,
      paint: { "line-color": c.crossPassage, "line-width": ["interpolate", ["linear"], ["zoom"], 14, 2, 17, 5], "line-opacity": 0.95 },
    });

  if (has("boreholes"))
    layers.push({
      id: "cx-boreholes-dot",
      type: "circle",
      source: "cx-boreholes",
      paint: {
        "circle-color": c.borehole,
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 2.2, 16, 5, 18, 7],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 12, 0.8, 16, 1.6],
      },
    });

  if (has("sensitive")) {
    layers.push({
      id: "cx-sensitive-dot",
      type: "circle",
      source: "cx-sensitive",
      paint: { "circle-color": c.sensitive, "circle-radius": 5.5, "circle-stroke-color": "#ffffff", "circle-stroke-width": 1.6, "circle-opacity": 0.95 },
    });
    layers.push({
      id: "cx-sensitive-label",
      type: "symbol",
      source: "cx-sensitive",
      minzoom: 14.5,
      layout: {
        "text-field": ["coalesce", ["get", "name"], ["match", ["get", "kind"], "park", "Park", "school", "School", "care home", "Care home", "hospital", "Hospital", ["get", "kind"]]],
        "text-font": FONT,
        "text-size": 11,
        "text-offset": [0, 1.1],
        "text-anchor": "top",
        "text-max-width": 9,
      },
      paint: { "text-color": dark ? "#ffb4ad" : "#9b1c1c", "text-halo-color": halo, "text-halo-width": 1.4 },
    });
  }

  if (has("shafts")) {
    layers.push({
      id: "cx-shafts-extrusion",
      type: "fill-extrusion",
      source: "cx-shafts",
      paint: {
        "fill-extrusion-color": ["case", ["==", ["get", "id"], "launch"], c.shaft, c.shaftTop],
        "fill-extrusion-height": ["coalesce", ["get", "heightM"], 10],
        "fill-extrusion-base": 0,
        "fill-extrusion-opacity": 0.88,
      },
    });
    layers.push({
      id: "cx-shafts-label",
      type: "symbol",
      source: "cx-shafts",
      layout: {
        "text-field": ["concat", ["get", "label"], "\n", ["to-string", ["get", "depthM"]], " m deep"],
        "text-font": FONT_BOLD,
        "text-size": 12.5,
        "text-offset": [0, -2.2],
        "text-allow-overlap": true,
      },
      paint: { "text-color": ink, "text-halo-color": halo, "text-halo-width": 1.8 },
    });
  }

  if (has("crossings"))
    layers.push({
      id: "cx-crossings-label",
      type: "symbol",
      source: "cx-crossings",
      layout: {
        "text-field": ["concat", ["get", "name"], "\n", "tunnel passes beneath"],
        "text-font": FONT_BOLD,
        "text-size": 12,
        "text-offset": [0, 1.4],
        "text-anchor": "top",
        "text-allow-overlap": true,
      },
      paint: { "text-color": dark ? "#a3c1ff" : "#163f8f", "text-halo-color": halo, "text-halo-width": 1.8 },
    });

  return { sources, layers };
}
