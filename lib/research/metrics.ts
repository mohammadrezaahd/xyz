import type { ResearchObservation } from "./types";

export type ResearchMetrics = {
  totalObservations: number;
  observationsWithPaperTests: number;
  observationsWithoutPaperTests: number;
  resolvedObservations: number;
  targetHits: number;
  liquidations: number;
  manualCloses: number;
  winRate: number | null;
  averageNetPnl: number | null;
  averageRoi: number | null;
  averageDurationMs: number | null;
};

function average(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export function calculateResearchMetrics(observations: ResearchObservation[]): ResearchMetrics {
  const withPaper = observations.filter((item) => item.paperPositionId !== null);
  const resolved = observations.filter((item) => item.status === "RESOLVED" && item.actual.resolvedAt !== null);
  const targetHits = resolved.filter((item) => item.actual.result === "PREDICT_SUCCESS");
  const liquidations = resolved.filter((item) => item.actual.result === "LIQUIDATED");
  const manualCloses = resolved.filter((item) => item.actual.exitReason === "MANUAL_CLOSE");
  return {
    totalObservations: observations.length,
    observationsWithPaperTests: withPaper.length,
    observationsWithoutPaperTests: observations.length - withPaper.length,
    resolvedObservations: resolved.length,
    targetHits: targetHits.length,
    liquidations: liquidations.length,
    manualCloses: manualCloses.length,
    winRate: resolved.length ? targetHits.length / resolved.length : null,
    averageNetPnl: average(resolved.map((item) => item.actual.netPnl).filter((value): value is number => value !== null && Number.isFinite(value))),
    averageRoi: average(resolved.map((item) => item.actual.roi).filter((value): value is number => value !== null && Number.isFinite(value))),
    averageDurationMs: average(resolved.map((item) => item.actual.durationMs).filter((value): value is number => value !== null && Number.isFinite(value))),
  };
}
