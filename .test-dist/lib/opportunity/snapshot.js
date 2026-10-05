"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PHASE_3_ENGINE_VERSION = void 0;
exports.buildOpportunityDocument = buildOpportunityDocument;
exports.PHASE_3_ENGINE_VERSION = "phase-2-opportunity-engine";
function buildOpportunityDocument(analysis, detectedAt = new Date()) {
    if (analysis.prices.bitpin === null ||
        analysis.prices.wallex === null ||
        analysis.spread.percent === null ||
        analysis.target.safeTarget === null) {
        throw new Error("Cannot persist an opportunity without valid ticker/spread/target data.");
    }
    return {
        createdAt: detectedAt,
        updatedAt: detectedAt,
        status: "OPEN",
        direction: "SHORT",
        entry: {
            price: analysis.prices.bitpin,
            source: "bitpin",
        },
        target: {
            price: analysis.target.safeTarget,
            source: "phase-2-safe-target",
        },
        market: {
            bitpinPrice: analysis.prices.bitpin,
            wallexPrice: analysis.prices.wallex,
            spreadPct: analysis.spread.percent,
        },
        analysis: {
            score: analysis.stabilityScore,
            tests: {
                externalValidation: analysis.validation.external,
                wallexAboveBitpin: analysis.validation.wallexAboveBitpin,
                spreadThreshold: analysis.validation.spread,
                bitpinBullishRatio: analysis.validation.bitpinBullish,
                wallexBullishRatio: analysis.validation.wallexBullish,
                candleAlignment: analysis.validation.candleAlignment,
                targetViability: analysis.validation.targetViability,
            },
            metrics: {
                bitpinBullishPct: analysis.candles.bitpinBullishRatio === null
                    ? null
                    : analysis.candles.bitpinBullishRatio * 100,
                wallexBullishPct: analysis.candles.wallexBullishRatio === null
                    ? null
                    : analysis.candles.wallexBullishRatio * 100,
                candleAlignmentPct: analysis.candles.alignmentRatio === null
                    ? null
                    : analysis.candles.alignmentRatio * 100,
                averageDirectionalMovePct: analysis.candles.averageDirectionalMovePct,
                momentumScore: analysis.candles.momentumScore,
            },
        },
        outcome: {
            status: "PENDING",
            resolvedAt: null,
            exitPrice: null,
            priceChangePct: null,
        },
        detection: {
            detectedAt,
            engineVersion: exports.PHASE_3_ENGINE_VERSION,
        },
        monitoring: {
            currentBitpinPrice: analysis.prices.bitpin,
            updatedAt: detectedAt,
        },
    };
}
