// Spend, tokens and an energy estimate, all computed from the `usage` entries in the
// public log, so the /spend page and the daily cap read the same numbers anyone can
// verify.
import type { UsageSummary } from "../shared/types.ts";
import type { Log } from "./log.ts";
import { torontoDay, torontoOffset } from "./time.ts";

// Energy per token is a rough, stated assumption, not a measurement: providers don't
// publish per-token energy for a specific model. Anchors: Google reported a median
// Gemini Apps text prompt at 0.24 Wh including data-centre overhead (Google, "Measuring
// the environmental impact of delivering AI at Google scale", Aug 2025); Epoch AI
// estimated ~0.3 Wh for a typical GPT-4o reply of ~500 output tokens (Feb 2025), about
// 0.0006 Wh per output token for a large model. For a "flash" class model we assume
// half that per output token, and a tenth of it per input token (reading a prompt is
// far cheaper than generating, which API prices reflect too).
export const WH_PER_OUTPUT_TOKEN = 0.0003;
export const WH_PER_INPUT_TOKEN = 0.00003;

// Ontario's grid is mostly nuclear and hydro: about 30 g CO2e per kWh generated in
// recent years (IESO annual planning outlooks; Canada Energy Regulator, "Provincial and
// Territorial Energy Profiles: Ontario"). The models run in the provider's data
// centres, whose grid may be dirtier; we use Ontario's figure as the spec asks and say so.
export const GRID_G_CO2E_PER_KWH = 30;

export interface UsagePayload {
  model?: string;
  calls?: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Read one usage payload, tolerating the shapes an agent might log. */
export function readUsage(p: unknown): Required<UsagePayload> {
  const o = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
  const u = (o.usage && typeof o.usage === "object" ? o.usage : o) as Record<string, unknown>;
  return {
    model: typeof o.model === "string" ? o.model : typeof u.model === "string" ? u.model : "unknown",
    calls: u.calls === undefined ? 1 : num(u.calls),
    inputTokens: num(u.inputTokens ?? u.promptTokens),
    // Gemini reports thinking separately; it's generated (and billed) like output.
    outputTokens: u.outputTokens !== undefined ? num(u.outputTokens) : num(u.candidatesTokens ?? u.completionTokens) + num(u.thoughtsTokens),
    costUsd: num(u.costUsd),
  };
}

/** ISO instant (UTC) at which today's Toronto day began; the cap resets then. */
export function startOfTorontoDayIso(at = new Date()): string {
  const day = torontoDay(at);
  return new Date(Date.parse(`${day}T00:00:00${torontoOffset(day)}`)).toISOString();
}

export function spentTodayUsd(log: Log, at = new Date()): number {
  return log.usagePayloads(startOfTorontoDayIso(at)).reduce((s, r) => s + readUsage(r.payload).costUsd, 0);
}

export type UsageResponse = UsageSummary & {
  method: { whPerInputToken: number; whPerOutputToken: number; gridGCo2ePerKwh: number; note: string };
};

export function summarise(log: Log, limitUsd: number, at = new Date()): UsageResponse {
  const s: UsageSummary = {
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    energyWh: 0,
    co2eGrams: 0,
    byModel: {},
    today: { costUsd: 0, limitUsd },
  };
  const dayStart = startOfTorontoDayIso(at);
  for (const row of log.usagePayloads()) {
    const u = readUsage(row.payload);
    s.calls += u.calls;
    s.inputTokens += u.inputTokens;
    s.outputTokens += u.outputTokens;
    s.costUsd += u.costUsd;
    const m = (s.byModel[u.model] ??= { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 });
    m.calls += u.calls;
    m.inputTokens += u.inputTokens;
    m.outputTokens += u.outputTokens;
    m.costUsd += u.costUsd;
    if (row.at >= dayStart) s.today.costUsd += u.costUsd;
  }
  s.energyWh = s.inputTokens * WH_PER_INPUT_TOKEN + s.outputTokens * WH_PER_OUTPUT_TOKEN;
  s.co2eGrams = (s.energyWh / 1000) * GRID_G_CO2E_PER_KWH;
  const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;
  s.costUsd = round(s.costUsd, 6);
  for (const m of Object.values(s.byModel)) m.costUsd = round(m.costUsd, 6);
  s.today.costUsd = round(s.today.costUsd, 6);
  s.energyWh = round(s.energyWh, 3);
  s.co2eGrams = round(s.co2eGrams, 4);
  return {
    ...s,
    method: {
      whPerInputToken: WH_PER_INPUT_TOKEN,
      whPerOutputToken: WH_PER_OUTPUT_TOKEN,
      gridGCo2ePerKwh: GRID_G_CO2E_PER_KWH,
      note:
        "Energy is an estimate: tokens times an assumed Wh per token, anchored on Google's published 0.24 Wh median Gemini prompt (2025). " +
        "CO2e uses Ontario's grid at about 30 g/kWh (IESO, Canada Energy Regulator); the provider's data centres may differ.",
    },
  };
}
