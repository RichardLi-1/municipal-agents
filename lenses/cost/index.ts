// The cost lens's tool entry points. `lifecycleCost(inputs)` is the pure calculation;
// called with a CostLens built by buildCostLens (which keeps its inputs) and overrides, it
// recomputes that lens for another horizon or discount rate.

import type { CostLens } from "../../shared/types.ts";
import { lifecycleCost as compute, buildCostLens, costSummary } from "./lifecycle.ts";
import type { LifecycleInputs, LifecycleResult } from "./lifecycle.ts";

export { buildCostLens, costSummary };
export type { LifecycleInputs, LifecycleResult };

export function lifecycleCost(inputs: LifecycleInputs): LifecycleResult;
export function lifecycleCost(lens: CostLens & { inputs: LifecycleInputs }, overrides: Partial<LifecycleInputs>): CostLens;
export function lifecycleCost(arg: LifecycleInputs | (CostLens & { inputs: LifecycleInputs }), overrides?: Partial<LifecycleInputs>): LifecycleResult | CostLens {
  if ("inputs" in arg && arg.inputs) {
    const inputs = { ...arg.inputs, ...(overrides ?? {}) };
    const res = compute(inputs);
    return { ...arg, inputs, horizonYears: inputs.horizonYears, discountRate: inputs.discountRate ?? 0, series: res.series, totals: res.totals } as CostLens;
  }
  if ("startYear" in arg) return compute({ ...arg, ...(overrides ?? {}) });
  throw new Error("lifecycleCost needs LifecycleInputs, or a CostLens built by buildCostLens (with its inputs)");
}
