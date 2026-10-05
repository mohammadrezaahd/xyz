"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PHASE_2_CONFIG = exports.DEFAULT_OPPORTUNITY_CONFIG = void 0;
exports.DEFAULT_OPPORTUNITY_CONFIG = {
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
exports.PHASE_2_CONFIG = exports.DEFAULT_OPPORTUNITY_CONFIG;
