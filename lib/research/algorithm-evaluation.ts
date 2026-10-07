import type { ResearchObservation } from "./types";
export const MIN_RESEARCH_SAMPLE_SIZE = 30;
export type ResearchEvaluation = {
  status: "OK" | "INSUFFICIENT_SAMPLE"; configurationVersion: string; sampleCount: number;
  targetHitRate: number | null; liquidationRate: number | null; averageNetPnl: number | null;
  averageRoi: number | null; averageDurationMs: number | null; maxDrawdownPnl: number | null;
  segments: Record<string, unknown>; recommendation: "INSUFFICIENT_SAMPLE" | "REVIEW_CANDIDATE" | "NO_CHANGE";
};
const average = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
export function evaluateResearchObservations(observations: ResearchObservation[], configurationVersion: string): ResearchEvaluation {
  const items = observations.filter((x) => x.configurationVersion === configurationVersion && x.status === "RESOLVED" && x.actual.resolvedAt);
  if (items.length < MIN_RESEARCH_SAMPLE_SIZE) return { status: "INSUFFICIENT_SAMPLE", configurationVersion, sampleCount: items.length, targetHitRate: null, liquidationRate: null, averageNetPnl: null, averageRoi: null, averageDurationMs: null, maxDrawdownPnl: null, segments: {}, recommendation: "INSUFFICIENT_SAMPLE" };
  const pnls = items.map((x) => x.actual.netPnl).filter((x): x is number => x != null && Number.isFinite(x));
  let running = 0, peak = 0, maxDrawdownPnl = 0;
  for (const pnl of pnls) { running += pnl; peak = Math.max(peak, running); maxDrawdownPnl = Math.min(maxDrawdownPnl, running - peak); }
  const targetHitRate = items.filter((x) => x.actual.result === "PREDICT_SUCCESS").length / items.length;
  const liquidationRate = items.filter((x) => x.actual.result === "LIQUIDATED").length / items.length;
  const segments: Record<string, unknown> = {};
  const fields: Array<[string, (x: ResearchObservation) => string]> = [
    ["risk", (x) => x.prediction.riskLevel], ["stability", (x) => String(x.prediction.stabilityScore)],
    ["spread", (x) => String(x.market.spreadPct ?? "null")], ["lookback", (x) => String(x.candles.lookback)],
  ];
  for (const [name, selector] of fields) {
    const values = [...new Set(items.map(selector))];
    segments[name] = Object.fromEntries(values.map((key) => {
      const group = items.filter((x) => selector(x) === key);
      return [key, { sampleCount: group.length, targetHitRate: group.filter((x) => x.actual.result === "PREDICT_SUCCESS").length / group.length, liquidationRate: group.filter((x) => x.actual.result === "LIQUIDATED").length / group.length, averageNetPnl: average(group.map((x) => x.actual.netPnl).filter((x): x is number => x != null)) }];
    }));
  }
  const recommendation = liquidationRate > 0.2 || maxDrawdownPnl < 0 ? "REVIEW_CANDIDATE" : "NO_CHANGE";
  return { status: "OK", configurationVersion, sampleCount: items.length, targetHitRate, liquidationRate, averageNetPnl: average(pnls), averageRoi: average(items.map((x) => x.actual.roi).filter((x): x is number => x != null)), averageDurationMs: average(items.map((x) => x.actual.durationMs).filter((x): x is number => x != null)), maxDrawdownPnl, segments, recommendation };
}
