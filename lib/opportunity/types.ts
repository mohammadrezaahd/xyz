import type { Candle } from "@/lib/candles";

export type TestStatus = "SUCCESS" | "FAILED" | "INSUFFICIENT_DATA";
export type OpportunityLevel = "STRONG" | "MODERATE" | "WEAK" | "NONE";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";
export type CandleDirection = "BULLISH" | "BEARISH" | "NEUTRAL";

export interface TestResult {
  status: TestStatus;
  actual: number | null;
  threshold: number | null;
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
  };
  candles: {
    lookback: number;
    synchronized: number;
    bitpinBullishRatio: number | null;
    wallexBullishRatio: number | null;
    alignmentRatio: number | null;
    averageDirectionalMovePct: number | null;
  };
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
    netPct: number | null;
  };
  stabilityScore: number;
  riskLevel: RiskLevel;
  opportunity: OpportunityLevel;
}
