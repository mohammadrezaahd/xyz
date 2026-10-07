export interface OpportunityConfiguration {\n  version: string;\n  description: string;\n  externalValidationPct: number;\n  spreadTriggerPct: number;\n  lookbackCandles: number;\n  minBullishRatio: number;\n  minAlignmentRatio: number;\n  minCandleMovePct: number;\n  momentumReferencePct: number;\n  safetyMarginPct: number;\n  targetHorizonMinutes: number;\n  takerFeePct: number;\n  makerFeePct: number;\n  scoreWeights: OpportunityConfig["scoreWeights"];\n  riskThresholds: OpportunityConfig["riskThresholds"];\n  opportunityThresholds: OpportunityConfig["opportunityThresholds"];\n}\n\nexport interface OpportunityConfig {
  externalValidationPct: number;
  spreadTriggerPct: number;
  lookbackCandles: number;
  minBullishRatio: number;
  minAlignmentRatio: number;
  minCandleMovePct: number;
  momentumReferencePct: number;
  safetyMarginPct: number;
  targetHorizonMinutes: number;
  takerFeePct: number;
  makerFeePct: number;
  scoreWeights: {
    externalValidation: number;
    spreadQuality: number;
    candleAlignment: number;
    bitpinBullishRatio: number;
    wallexBullishRatio: number;
    momentumQuality: number;
  };
  riskThresholds: {
    low: number;
    medium: number;
    high: number;
  };
  opportunityThresholds: {
    strong: number;
    moderate: number;
    weak: number;
  };
}

export const DEFAULT_OPPORTUNITY_CONFIG: OpportunityConfig & Pick<OpportunityConfiguration, "version" | "description"> = {\n  version: "phase-5a-live-default-v1",\n  description: "Immutable Phase 5A live baseline configuration",
  externalValidationPct: 0.4,
  spreadTriggerPct: 1,
  lookbackCandles: 10,
  minBullishRatio: 0.8,
  minAlignmentRatio: 0.8,
  minCandleMovePct: 0.05,
  momentumReferencePct: 0.2,
  safetyMarginPct: 0.35,
  targetHorizonMinutes: 30,
  takerFeePct: 0.35,
  makerFeePct: 0.3,
  scoreWeights: {
    externalValidation: 20,
    spreadQuality: 20,
    candleAlignment: 25,
    bitpinBullishRatio: 15,
    wallexBullishRatio: 15,
    momentumQuality: 5,
  },
  riskThresholds: {
    low: 80,
    medium: 65,
    high: 50,
  },
  opportunityThresholds: {
    strong: 80,
    moderate: 65,
    weak: 50,
  },
};

export const PHASE_5A_LIVE_DEFAULT_V1: OpportunityConfiguration = DEFAULT_OPPORTUNITY_CONFIG;\nexport const PHASE_2_CONFIG = DEFAULT_OPPORTUNITY_CONFIG;
