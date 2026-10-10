import type { Candle } from "../candles";
import type { OpportunityDecision } from "./config";
import type { ExecutionCostConfig } from "./config";

export type TestStatus = "SUCCESS" | "ACCEPTABLE" | "FAILED" | "INSUFFICIENT_DATA";
export type OpportunityLevel = "STRONG" | "MODERATE" | "WEAK" | "NONE";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";
export type CandleDirection = "BULLISH" | "BEARISH" | "NEUTRAL";
export type ExternalReferencePrice = {
  price: number | null;
  fetchedAt: number | null;
  provider: string | null;
  error: string | null;
};
export type BuySellBalance = {
  value: number | null;
  buyScore: number | null;
  sellScore: number | null;
  label: "BUY BIAS" | "SELL BIAS" | "BALANCED" | "INSUFFICIENT DATA";
  explanation: string;
  executionRoute: "LONG" | "REVERSE" | "NONE";
  executionEligible: boolean;
};
export type DataQuality = {
  status: "READY" | "INCOMPLETE" | "STALE" | "ERROR";
  reasons: string[];
};

export type CandleSyncDiagnostics = {
  bitpinReceived: number;
  wallexReceived: number;
  synchronizedAvailable: number;
  synchronizedUsed: number;
  minimumRequired: number;
  lookbackLimit: number;
  stabilityLookback: number;
  stabilitySelected: SelectedCandlePair[];
  currentCandleExcluded: boolean;
};

export type SelectedCandle = {
  timestamp: number;
  open: number;
  close: number;
  movementPct: number;
  direction: CandleDirection;
};

export type SelectedCandlePair = {
  timestamp: number;
  bitpin: SelectedCandle;
  wallex: SelectedCandle;
};

export interface TestResult {
  status: TestStatus;
  actual: number | null;
  threshold: number | null;
}

export interface CurrentPrices {
  bitpin: number | null;
  wallex: number | null;
  fetchedAt: number;
}

export interface OpportunityAnalysis {
  prices: {
    bitpin: number | null;
    wallex: number | null;
    external: number | null;
  };
  spread: {
    absolute: number | null;
    percent: number | null;
  };
  validation: {
    external: TestResult;
    wallexAboveBitpin: TestResult;
    spread: TestResult;
    candleAlignment: TestResult;
    bitpinBullish: TestResult;
    wallexBullish: TestResult;
    targetViability: TestResult;
    momentum: TestResult;
  };
  candles: CandleSyncDiagnostics & {
    lookback: number;
    synchronized: number;
    selected: SelectedCandlePair[];
    bitpinBullishRatio: number | null;
    wallexBullishRatio: number | null;
    alignmentRatio: number | null;
    directionalAgreementRatio: number | null;
    directionalParticipationRatio: number | null;
    neutralPairRatio: number | null;
    averageDirectionalMovePct: number | null;
    momentumScore: number | null;
  };
  minimumRequiredCandlePairs: number;
  target: {
    entryPrice: number | null;
    safeTarget: number | null;
    safetyMarginPct: number;
    horizonMinutes: number;
  };
  edge: {
    gross: number | null;
    grossPct: number | null;
    feesPct: number;
    slippagePct: number;
    latencyPct: number;
    transferCostPct: number;
    netPct: number | null;
    expectedNetProfit: number | null;
    executionNetPct: number | null;
  };
  stabilityScore: number;
  dataCompleteness: number;
  riskLevel: RiskLevel;
  opportunity: OpportunityLevel;
  decision: OpportunityDecision;
  decisionReason: string;
  eligibleForSignal: boolean;
  buySellBalance: BuySellBalance;
  quoteFreshness: { bitpinAgeMs: number | null; wallexAgeMs: number | null; externalAgeMs: number | null };
  configurationVersion: string;
  engineVersion: string;
  executionCostVersion: string;
  executionCosts: ExecutionCostConfig;
  dataQuality: DataQuality;
}
