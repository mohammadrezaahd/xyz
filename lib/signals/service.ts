import { createHash } from "node:crypto";
import type { ResearchObservation } from "../research/types";
import type { SignalDocument } from "./types";
import { createSignal, findActiveSignalByKey, updateSignal } from "./repository";

export function buildSignalKey(observation: ResearchObservation) {
  const bucket = Math.floor(observation.detectedAt.getTime() / 300000) * 300000;
  return "signal:" + createHash("sha256").update([
    observation.prediction.direction, observation.configurationVersion, bucket,
    observation.prediction.suggestedEntryPrice ?? "null", observation.prediction.safeTargetPrice ?? "null",
    observation.market.spreadPct ?? "null", observation.prediction.riskLevel, observation.prediction.opportunityStrength,
  ].join(":")).digest("hex");
}
export function buildSignal(observation: ResearchObservation, now = new Date()): SignalDocument | null {
  const entry = observation.prediction.suggestedEntryPrice;
  const target = observation.prediction.safeTargetPrice;
  if (!observation._id || entry == null || target == null) return null;
  return {
    signalKey: buildSignalKey(observation), status: "ACTIVE", createdAt: now, updatedAt: now,
    detectedAt: observation.detectedAt, expiresAt: new Date(observation.detectedAt.getTime() + 30 * 60000),
    sourceResearchObservationId: observation._id, sourceOpportunityId: observation.sourceOpportunityId,
    paperPositionId: observation.paperPositionId, direction: observation.prediction.direction,
    riskLevel: observation.prediction.riskLevel, opportunityStrength: observation.prediction.opportunityStrength,
    stabilityScore: observation.prediction.stabilityScore, confidence: observation.prediction.confidence ?? observation.prediction.dataCompleteness,
    spreadPct: observation.market.spreadPct, entryPrice: entry, targetPrice: target,
    expectedProfit: observation.prediction.expectedGrossPnl,
    expectedLoss: observation.prediction.liquidationPrice == null ? null : Math.abs(entry - observation.prediction.liquidationPrice),
    expectedNetPnl: observation.prediction.expectedNetPnl, expectedRoi: observation.prediction.expectedRoi,
    breakEvenPrice: observation.prediction.breakEvenPrice, liquidationPrice: observation.prediction.liquidationPrice,
    currentPrice: observation.market.bitpinPrice, lastCheckedAt: now, lastError: null,
    resolvedAt: null, actualExitPrice: null, actualResult: null, actualNetPnl: null, actualRoi: null,
    configurationVersion: observation.configurationVersion, engineVersion: observation.engineVersion,
  };
}
export async function processSignal(observation: ResearchObservation, currentPrice: number, now = new Date()) {
  const document = buildSignal(observation, now);
  if (!document) return null;
  const existing = await findActiveSignalByKey(document.signalKey);
  if (existing?._id) {
    if (now >= existing.expiresAt) return updateSignal(existing._id, { status: "EXPIRED", resolvedAt: now, currentPrice, lastCheckedAt: now });
    if (currentPrice >= existing.targetPrice) return updateSignal(existing._id, { status: "TARGET_REACHED", resolvedAt: now, actualExitPrice: currentPrice, actualResult: "PREDICT_SUCCESS", currentPrice, lastCheckedAt: now });
    if (existing.liquidationPrice != null && currentPrice <= existing.liquidationPrice) return updateSignal(existing._id, { status: "STOPPED", resolvedAt: now, actualExitPrice: currentPrice, actualResult: "LIQUIDATED", currentPrice, lastCheckedAt: now });
    return updateSignal(existing._id, { currentPrice, lastCheckedAt: now, lastError: null });
  }
  return (await createSignal({ ...document, currentPrice })).signal;
}
