import type { ObjectId } from "mongodb";
import type { TestResult, OpportunityAnalysis, OpportunityLevel, RiskLevel } from "../opportunity/types";

export const RESEARCH_ENGINE_VERSION = "phase-2-opportunity-engine";
export const RESEARCH_CONFIGURATION_VERSION = "phase-5a-live-default-v1";
export const RESEARCH_TIMEFRAME = "1m" as const;

export type ResearchObservationStatus = "DETECTED" | "PAPER_STARTED" | "RESOLVED" | "EXPIRED" | "INVALIDATED";
export type ResearchObservationSource = "LIVE_CRON" | "BACKTEST";
export type ResearchDirection = "LONG" | "SHORT";

export type ResearchCheck = TestResult & { comparison?: "LTE" | "GTE" | "GT" | "EQ" };
export type ResearchObservationActual = {
  entryPrice: number | null;
  exitPrice: number | null;
  targetPrice: number | null;
  liquidationPrice: number | null;
  result: string | null;
  exitReason: string | null;
  grossPnl: number | null;
  totalFees: number | null;
  netPnl: number | null;
  roi: number | null;
  durationMs: number | null;
  resolvedAt: Date | null;
};

export type ResearchObservation = {
  _id?: ObjectId;
  observationKey: string;
  createdAt: Date;
  updatedAt: Date;
  status: ResearchObservationStatus;
  source: ResearchObservationSource;
  sourceOpportunityId: ObjectId | null;
  detectedAt: Date;
  engineVersion: string;
  configurationVersion: string;
  market: {
    bitpinPrice: number | null;
    wallexPrice: number | null;
    externalUsdtPrice: number | null;
    absoluteSpread: number | null;
    spreadPct: number | null;
    marketFreshness: { fetchedAt: Date; ageMs: number | null };
    providerAvailability: { bitpin: boolean; wallex: boolean; externalUsdt: boolean };
  };
  candles: {
    timeframe: string;
    lookback: number;
    synchronizedCandleCount: number;
    bitpinBullishRatio: number | null;
    wallexBullishRatio: number | null;
    candleAlignmentPct: number | null;
    averageDirectionalMovePct: number | null;
    momentumScore: number | null;
  };
  stabilityChecks: {
    externalValidation: ResearchCheck;
    wallexAboveBitpin: ResearchCheck;
    spreadThreshold: ResearchCheck;
    bitpinBullishRatio: ResearchCheck;
    wallexBullishRatio: ResearchCheck;
    candleAlignment: ResearchCheck;
    targetViability: ResearchCheck;
    momentum: ResearchCheck;
  };
  prediction: {
    opportunityClassification: OpportunityLevel;
    opportunityStrength: OpportunityLevel;
    direction: ResearchDirection;
    stabilityScore: number;
    riskLevel: RiskLevel;
    confidence: number | null;
    dataCompleteness: number;
    suggestedEntryPrice: number | null;
    suggestedTargetPrice: number | null;
    safeTargetPrice: number | null;
    safetyMargin: number;
    expectedGrossPnl: number | null;
    expectedNetPnl: number | null;
    expectedRoi: number | null;
    breakEvenPrice: number | null;
    liquidationPrice: number | null;
  };
  paperPositionId: ObjectId | null;
  paperPositionStartedAt: Date | null;
  actual: ResearchObservationActual;
};

export type ResearchObservationInput = {
  analysis: OpportunityAnalysis;
  detectedAt: Date;
  source: ResearchObservationSource;
  sourceOpportunityId?: ObjectId | null;
  fetchedAt?: Date;
};
