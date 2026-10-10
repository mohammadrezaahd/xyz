import { createHash } from "node:crypto";
import type { ObjectId } from "mongodb";
import { calculateLeveragedPnl, createPositionSimulation } from "../opportunity/position";
import type { OpportunityAnalysis, TestResult } from "../opportunity/types";
import {
  RESEARCH_CONFIGURATION_VERSION,
  RESEARCH_ENGINE_VERSION,
  RESEARCH_TIMEFRAME,
  type ResearchCheck,
  type ResearchObservation,
  type ResearchObservationInput,
} from "./types";

function check(result: TestResult, comparison?: ResearchCheck["comparison"]): ResearchCheck {
  return comparison ? { ...result, comparison } : { ...result };
}

function valueOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function buildObservationKey(input: ResearchObservationInput): string {
  const analysis = input.analysis;
  const bucket = Math.floor(input.detectedAt.getTime() / 60_000) * 60_000;
  const stable = [
    input.source.toLowerCase(),
    RESEARCH_ENGINE_VERSION,
    RESEARCH_CONFIGURATION_VERSION,
    "usdt-toman",
    bucket,
  ].join(":");
  return `research:${createHash("sha256").update(stable).digest("hex")}`;
}

export function buildResearchObservation(input: ResearchObservationInput): ResearchObservation {
  const { analysis, detectedAt } = input;
  const fetchedAt = input.fetchedAt ?? detectedAt;
  const entry = valueOrNull(analysis.target.entryPrice);
  const target = valueOrNull(analysis.target.safeTarget);
  const simulation = entry !== null && target !== null ? createPositionSimulation(entry, target) : null;
  const expected = simulation ? calculateLeveragedPnl(entry!, simulation.targetPrice, simulation) : null;
  const key = buildObservationKey(input);
  return {
    observationKey: key,
    createdAt: detectedAt,
    updatedAt: detectedAt,
    status: "DETECTED",
    source: input.source,
    sourceOpportunityId: input.sourceOpportunityId ?? null,
    detectedAt,
    engineVersion: RESEARCH_ENGINE_VERSION,
    configurationVersion: RESEARCH_CONFIGURATION_VERSION,
    market: {
      bitpinPrice: valueOrNull(analysis.prices.bitpin),
      wallexPrice: valueOrNull(analysis.prices.wallex),
      externalUsdtPrice: valueOrNull(analysis.prices.external),
      absoluteSpread: valueOrNull(analysis.spread.absolute),
      spreadPct: valueOrNull(analysis.spread.percent),
      marketFreshness: { fetchedAt, ageMs: Math.max(0, detectedAt.getTime() - fetchedAt.getTime()) },
      providerAvailability: {
        bitpin: analysis.prices.bitpin !== null,
        wallex: analysis.prices.wallex !== null,
        externalUsdt: analysis.prices.external !== null,
      },
    },
    candles: {
      timeframe: RESEARCH_TIMEFRAME,
      lookback: analysis.candles.lookback,
      synchronizedCandleCount: analysis.candles.synchronized,
      bitpinBullishRatio: valueOrNull(analysis.candles.bitpinBullishRatio),
      wallexBullishRatio: valueOrNull(analysis.candles.wallexBullishRatio),
      candleAlignmentPct: analysis.candles.alignmentRatio === null ? null : analysis.candles.alignmentRatio * 100,
      averageDirectionalMovePct: valueOrNull(analysis.candles.averageDirectionalMovePct),
      momentumScore: valueOrNull(analysis.candles.momentumScore),
    },
    stabilityChecks: {
      externalValidation: check(analysis.validation.external, "LTE"),
      wallexAboveBitpin: check(analysis.validation.wallexAboveBitpin, "GT"),
      spreadThreshold: check(analysis.validation.spread, "GTE"),
      bitpinBullishRatio: check(analysis.validation.bitpinBullish, "GTE"),
      wallexBullishRatio: check(analysis.validation.wallexBullish, "GTE"),
      candleAlignment: check(analysis.validation.candleAlignment, "GTE"),
      targetViability: check(analysis.validation.targetViability, "GT"),
      momentum: check(analysis.validation.momentum, "GTE"),
    },
    prediction: {
      opportunityClassification: analysis.opportunity,
      opportunityStrength: analysis.opportunity,
      direction: "LONG",
      stabilityScore: analysis.stabilityScore,
      riskLevel: analysis.riskLevel,
      confidence: null,
      dataCompleteness: analysis.dataCompleteness,
      suggestedEntryPrice: entry,
      suggestedTargetPrice: target,
      safeTargetPrice: target,
      safetyMargin: analysis.target.safetyMarginPct,
      expectedGrossPnl: expected?.grossPnlToman ?? null,
      expectedNetPnl: expected?.netPnlToman ?? null,
      expectedRoi: expected?.netPnlPct ?? null,
      breakEvenPrice: simulation?.breakEvenPrice ?? null,
      liquidationPrice: simulation?.liquidationPrice ?? null,
    },
    paperPositionId: null,
    paperPositionStartedAt: null,
    actual: {
      entryPrice: null,
      exitPrice: null,
      targetPrice: null,
      liquidationPrice: null,
      result: null,
      exitReason: null,
      grossPnl: null,
      totalFees: null,
      netPnl: null,
      roi: null,
      durationMs: null,
      resolvedAt: null,
    },
  };
}

export type ResearchSnapshotForTest = ReturnType<typeof buildResearchObservation>;
