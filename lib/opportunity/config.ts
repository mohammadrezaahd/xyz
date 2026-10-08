export type OpportunityDecision =
  | "NO_TRADE_INSUFFICIENT_DATA"
  | "NO_TRADE_NEGATIVE_EDGE"
  | "NO_TRADE_INVALID_TARGET"
  | "NO_TRADE_STALE_QUOTE"
  | "NO_TRADE_INSUFFICIENT_DEPTH"
  | "NO_TRADE_DIRECTION_CONFLICT"
  | "WATCH"
  | "BUY_CHEAP_SELL_EXPENSIVE"
  | "REVERSE_SELL_EXPENSIVE_BUY_CHEAP"
  | "EXIT_LONG"
  | "EXIT_SHORT";

export type ExecutionCostConfig = {
  takerEntryFeePct: number;
  takerExitFeePct: number;
  slippageBufferPct: number;
  latencyBufferPct: number;
  transferCostPct: number;
  minimumAbsoluteProfit: number;
  minimumNetEdgePct: number;
};

export interface OpportunityConfig {
  version: string;
  engineVersion: string;
  externalValidationPct: number;
  spreadTriggerPct: number;
  lookbackCandles: number;
  minimumCandlePairs: number;
  minBullishRatio: number;
  minAlignmentRatio: number;
  minimumDirectionalParticipationRatio: number;
  minCandleMovePct: number;
  momentumReferencePct: number;
  safetyMarginPct: number;
  targetHorizonMinutes: number;
  takerFeePct: number;
  makerFeePct: number;
  maxQuoteAgeMs: number;
  scoreWeights: {
    externalValidation: number;
    spreadQuality: number;
    candleAlignment: number;
    bitpinBullishRatio: number;
    wallexBullishRatio: number;
    momentumQuality: number;
  };
  riskThresholds: { low: number; medium: number; high: number };
  opportunityThresholds: { strong: number; moderate: number; weak: number };
  balanceThresholds: { buy: number; sell: number };
  executionCosts: ExecutionCostConfig;
}

export const GATED_ALGORITHM_VERSION = "phase-5b-gated-direction-aware-v1";
export const GATED_CONFIGURATION_VERSION = "phase-5b-buy-sell-balance-v1";

export const DEFAULT_OPPORTUNITY_CONFIG: OpportunityConfig = {
  version: GATED_CONFIGURATION_VERSION,
  engineVersion: GATED_ALGORITHM_VERSION,
  externalValidationPct: 0.4,
  spreadTriggerPct: 1,
  lookbackCandles: 10,
  minimumCandlePairs: 20,
  minBullishRatio: 0.8,
  minAlignmentRatio: 0.8,
  minimumDirectionalParticipationRatio: 0.5,
  minCandleMovePct: 0.05,
  momentumReferencePct: 0.2,
  safetyMarginPct: 0.35,
  targetHorizonMinutes: 30,
  takerFeePct: 0.35,
  makerFeePct: 0.3,
  maxQuoteAgeMs: 90_000,
  scoreWeights: {
    externalValidation: 20,
    spreadQuality: 20,
    candleAlignment: 25,
    bitpinBullishRatio: 15,
    wallexBullishRatio: 15,
    momentumQuality: 5,
  },
  riskThresholds: { low: 80, medium: 65, high: 50 },
  opportunityThresholds: { strong: 80, moderate: 65, weak: 50 },
  balanceThresholds: { buy: 65, sell: 35 },
  executionCosts: {
    takerEntryFeePct: 0.35,
    takerExitFeePct: 0.35,
    slippageBufferPct: 0.15,
    latencyBufferPct: 0.1,
    transferCostPct: 0.05,
    minimumAbsoluteProfit: 1_000,
    minimumNetEdgePct: 0.1,
  },
};

/** Historical alias. Stored observations keep the version captured at detection time. */
export const PHASE_2_CONFIG = DEFAULT_OPPORTUNITY_CONFIG;
