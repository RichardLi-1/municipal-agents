// Commitment progress (challenge 4): is a public target on track? Compare the latest figure with
// a straight line drawn from the baseline to the target. Pure function; the agents supply cited
// numbers and the explanation is plain text they can quote as computed.

export interface CommitmentInput {
  baselineYear: number;
  baselineValue: number;
  targetYear: number;
  targetValue: number;
  latestYear: number;
  latestValue: number;
  /** Words for the values, e.g. "tonnes CO2e" or "homes" (optional, for the explanation). */
  unit?: string;
  /** Slack in share of the way (default 0.05: within 5 percentage points of the line is on track). */
  tolerance?: number;
}

export interface CommitmentResult {
  status: "on-track" | "behind" | "done" | "unclear";
  /** Where a straight line from baseline to target would be in the latest year. */
  expected: number | null;
  /** Share of the change achieved so far (0..1+), and share of the time gone. */
  progressShare: number | null;
  timeShare: number | null;
  /** Change needed each year from the latest year to reach the target on time. */
  neededPerYear: number | null;
  explanation: string;
}

const fmtNum = (x: number) => {
  const a = Math.abs(x);
  const d = a >= 100 ? 0 : a >= 10 ? 1 : 2;
  return Number(x.toFixed(d)).toLocaleString("en-CA");
};
const pct = (x: number) => `${Math.round(x * 100)}%`;

export function commitmentStatus(inp: CommitmentInput): CommitmentResult {
  const { baselineYear: y0, baselineValue: v0, targetYear: y1, targetValue: v1, latestYear: yl, latestValue: vl } = inp;
  const u = inp.unit ? ` ${inp.unit}` : "";
  const tol = inp.tolerance ?? 0.05;
  const nums = [y0, v0, y1, v1, yl, vl];
  const unclear = (why: string): CommitmentResult => ({ status: "unclear", expected: null, progressShare: null, timeShare: null, neededPerYear: null, explanation: why });
  if (nums.some((n) => typeof n !== "number" || !Number.isFinite(n))) return unclear("Some of the numbers needed (baseline, target or latest figure) are missing, so progress can't be judged.");
  if (y1 <= y0) return unclear("The target year is not after the baseline year, so there is no line to compare against.");
  if (yl < y0) return unclear("The latest figure is older than the baseline, so it can't show progress.");
  if (v1 === v0) return unclear("The target equals the baseline, so this is a pledge to hold steady; a straight-line check doesn't apply.");

  const dir = Math.sign(v1 - v0);
  const timeShare = Math.min(1, (yl - y0) / (y1 - y0));
  const expected = v0 + (v1 - v0) * timeShare;
  const progressShare = (vl - v0) / (v1 - v0);
  const neededPerYear = yl < y1 ? (v1 - vl) / (y1 - yl) : null;
  const goal = `The goal is to go from ${fmtNum(v0)}${u} in ${y0} to ${fmtNum(v1)}${u} by ${y1}.`;
  const reached = dir > 0 ? vl >= v1 : vl <= v1;
  if (reached)
    return { status: "done", expected, progressShare, timeShare, neededPerYear, explanation: `${goal} The latest figure, ${fmtNum(vl)}${u} in ${yl}, has already reached the target.` };
  const line = `By ${yl}, a straight line from start to goal would be at ${fmtNum(expected)}${u}. The latest figure is ${fmtNum(vl)}${u}: ${pct(Math.max(0, progressShare))} of the way there with ${pct(timeShare)} of the time gone.`;
  if (yl >= y1)
    return { status: "behind", expected, progressShare, timeShare, neededPerYear, explanation: `${goal} ${line} The target year has passed without reaching it.` };
  const status = progressShare >= timeShare - tol ? "on-track" : "behind";
  const need = neededPerYear !== null ? ` To reach the goal on time it needs to ${dir > 0 ? "rise" : "fall"} by about ${fmtNum(Math.abs(neededPerYear))}${u} a year from now.` : "";
  const moving = progressShare < 0 ? " The figure has moved away from the target since the baseline." : "";
  return {
    status,
    expected,
    progressShare,
    timeShare,
    neededPerYear,
    explanation: `${goal} ${line}${moving} So it is ${status === "on-track" ? "on track" : "behind"} on a straight-line reading.${need} A straight line is a simple yardstick; real progress often comes in steps.`,
  };
}
