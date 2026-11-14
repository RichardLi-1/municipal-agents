import type { ComponentType } from "preact";
import type { LayerSpecification, SourceSpecification } from "maplibre-gl";
import type { ConstructionLens } from "../../../shared/types.ts";

/** Where the map should look; a construction step can also name the layers to show. */
export interface CameraFocus {
  center: [number, number];
  zoom: number;
  bearing?: number;
  pitch?: number;
  layers?: string[];
}

export interface ExtraLayers {
  sources: Record<string, SourceSpecification>;
  layers: LayerSpecification[];
}

/**
 * The construction lens lives in its own folder (web/src/construction/), written by
 * another builder. It is loaded only if it exists, so the build works without it.
 */
export interface ConstructionModule {
  ConstructionPanel: ComponentType<{ lens: ConstructionLens; onFocus: (f: CameraFocus) => void }>;
  constructionMapLayers: (lens: ConstructionLens) => unknown;
}

const found = import.meta.glob<ConstructionModule>(["../construction/index.ts", "../construction/index.tsx"]);

let loading: Promise<ConstructionModule | null> | null = null;
export function loadConstruction(): Promise<ConstructionModule | null> {
  loading ??= (async () => {
    const key = Object.keys(found)[0];
    if (!key) return null;
    try {
      return await found[key]();
    } catch (e) {
      console.error("Construction lens failed to load", e);
      return null;
    }
  })();
  return loading;
}

/** Accepts {sources, layers}, or a plain array of layers (with inline sources). */
export function normaliseLayers(v: unknown): ExtraLayers {
  if (!v) return { sources: {}, layers: [] };
  if (Array.isArray(v)) return { sources: {}, layers: v as LayerSpecification[] };
  const o = v as Partial<ExtraLayers>;
  return { sources: o.sources ?? {}, layers: o.layers ?? [] };
}
