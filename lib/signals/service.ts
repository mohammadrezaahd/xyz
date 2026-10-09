import { createHash } from "node:crypto";
import { ObjectId } from "mongodb";
import { listResearchObservations } from "../research/repository";
import { countResearchObservations, findLatestResearchObservation, getResearchDecisionBreakdown } from "../research/repository";
import type { ResearchObservation } from "../research/types";
import { fetchExternalReferencePrice } from "../external-reference";
import { latestAutomationRun } from "../automation-runs";
import { countSignals, expireSignals, insertSignal, listSignals, resolveSignal, updateSignalMonitoring } from "./repository";
import type { SignalDocument } from "./types";
function buildSignal(observation: ResearchObservation, now = new Date()): SignalDocument | null {
  if (!observation._id || !observation.prediction.eligibleForSignal) return null;
  const detectedAt = observation.detectedAt;
  const expiresAt = new Date(detectedAt.getTime() + 30 * 60_000);
  return {
    signalKey: createHash("sha256").update(`${observation.observationKey}:LONG_SPREAD`).digest("hex"),
    status: "ACTIVE", detectedAt, expiresAt,
    sourceResearchObservationId: observation._id,
    sourceOpportunityId: observation.sourceOpportunityId,
    paperPositionId: observation.paperPositionId,
    route: "LONG_SPREAD",
    decision: observation.prediction.decision,
    decisionReason: observation.prediction.decisionReason,
    riskLevel: observation.prediction.riskLevel,
    opportunityStrength: observation.prediction.opportunityStrength,
    stabilityScore: observation.prediction.stabilityScore,
    dataCompleteness: observation.prediction.dataCompleteness,
    buySellBalance: observation.prediction.buySellBalance,
    minimumRequiredCandlePairs: observation.prediction.minimumRequiredCandlePairs,
    dataQuality: observation.prediction.dataQuality,
    netEdgePct: observation.prediction.netEdgePct,
    entryPrice: observation.prediction.suggestedEntryPrice,
    targetPrice: observation.prediction.suggestedTargetPrice,
    expectedProfit: observation.prediction.expectedNetPnl,
    expectedLoss: observation.prediction.liquidationPrice && observation.prediction.suggestedEntryPrice ? Math.abs(observation.prediction.suggestedEntryPrice - observation.prediction.liquidationPrice) : null,
    breakEvenPrice: observation.prediction.breakEvenPrice,
    liquidationPrice: observation.prediction.liquidationPrice,
    currentPrice: observation.market.bitpinPrice,
    lastCheckedAt: now, resolvedAt: null, actualResult: null, actualNetPnl: null,
    engineVersion: observation.algorithmVersion,
    configurationVersion: observation.algorithmConfigurationVersion,
    executionCostVersion: observation.executionCostVersion,
  };
}
export async function createSignalFromObservation(observation: ResearchObservation) { const signal = buildSignal(observation); return signal ? insertSignal(signal) : null; }
export async function generateSignals() { const observations = await listResearchObservations({ status: "DETECTED", limit: 100 }); const results = []; for (const observation of observations) { const result = await createSignalFromObservation(observation); if (result) results.push(result); } return results; }
export async function monitorSignals(currentPrice: number | null, now = new Date()) { await expireSignals(now); const active = await listSignals({ status: "ACTIVE", limit: 100 }); let resolved = 0; let invalidated = 0; for (const signal of active) { if (!signal._id) continue; if (signal.targetPrice !== null && currentPrice !== null && currentPrice >= signal.targetPrice) { if (await resolveSignal(signal._id, "RESOLVED", currentPrice, signal.expectedProfit, now)) resolved++; } else if (signal.expiresAt <= now) { continue; } else { await updateSignalMonitoring(signal._id, currentPrice, now); } } return { checked: active.length, resolved, invalidated }; }
export async function getSignalsSummary() {
  const [allCount, activeCount, resolvedCount, expiredCount, invalidatedCount, latestSignal, eligible, detected, paperStarted, latestObservation, breakdown, signalRun, opportunityRun, externalReference] = await Promise.all([
    countSignals(), countSignals("ACTIVE"), countSignals("RESOLVED"), countSignals("EXPIRED"), countSignals("INVALIDATED"), listSignals({ limit: 1 }),
    countResearchObservations({ decision: "BUY_CHEAP_SELL_EXPENSIVE" }),
    countResearchObservations({ status: "DETECTED" }),
    countResearchObservations({ status: "PAPER_STARTED" }),
    findLatestResearchObservation(),
    getResearchDecisionBreakdown(),
    latestAutomationRun("SIGNALS_CRON"),
    latestAutomationRun("OPPORTUNITY_CRON"),
    fetchExternalReferencePrice(),
  ]);
  const rejected = breakdown.reduce((sum, item) => sum + item.count, 0);
  const externalFetchedAt = externalReference.fetchedAt;
  return {
    activeSignals: activeCount, totalSignals: allCount, resolvedSignals: resolvedCount, expiredSignals: expiredCount, invalidatedSignals: invalidatedCount,
    eligibleObservations: eligible, rejectedObservations: rejected, detectedObservations: detected, paperStartedObservations: paperStarted,
    latestSignalDetectedAt: latestSignal[0]?.detectedAt?.toISOString() ?? null,
    latestSignalCronAt: signalRun?.finishedAt?.toISOString() ?? null, latestOpportunityCronAt: opportunityRun?.finishedAt?.toISOString() ?? null,
    latestDecision: latestObservation?.prediction.decision ?? null, latestDecisionReason: latestObservation?.prediction.decisionReason ?? null,
    latestNetEdgePct: latestObservation?.prediction.netEdgePct ?? null,
    latestDataQuality: latestObservation?.prediction.dataQuality ?? null,
    latestCandlePairs: latestObservation?.candles.synchronizedCandleCount ?? null,
    latestRequiredCandlePairs: latestObservation?.candles.minimumRequiredCandlePairs ?? null,
    rejectionBreakdown: breakdown,
    externalReference: { available: externalReference.price !== null, provider: externalReference.provider, fetchedAt: externalFetchedAt ? new Date(externalFetchedAt).toISOString() : null, ageMs: externalFetchedAt ? Math.max(0, Date.now() - externalFetchedAt) : null, error: externalReference.error },
    signalSystemStatus: activeCount ? "Active research signals" : externalReference.price === null ? "Waiting for independent external reference" : detected === 0 ? "Waiting for research observations" : "Waiting for eligible data",
  };
}
export { listSignals };
