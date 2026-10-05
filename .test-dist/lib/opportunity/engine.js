"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeOpportunity = analyzeOpportunity;
const config_1 = require("./config");
const MINUTE_SECONDS = 60;
function classifyRatio(actual, threshold) {
    const status = actual >= threshold ? "SUCCESS" : actual >= 0.5 ? "ACCEPTABLE" : "FAILED";
    return { status, actual, threshold };
}
function insufficient(threshold = null) {
    return {
        status: "INSUFFICIENT_DATA",
        actual: null,
        threshold,
    };
}
function normalizePositivePrice(value) {
    return typeof value === "number" && Number.isFinite(value) && value > 0
        ? value
        : null;
}
function direction(candle, minMovePct) {
    if (!Number.isFinite(candle.open) ||
        candle.open <= 0 ||
        !Number.isFinite(candle.close)) {
        return "NEUTRAL";
    }
    const changePct = (Math.abs(candle.close - candle.open) / candle.open) * 100;
    if (changePct < minMovePct)
        return "NEUTRAL";
    return candle.close > candle.open ? "BULLISH" : "BEARISH";
}
function movePct(candle) {
    if (!Number.isFinite(candle.open) ||
        candle.open <= 0 ||
        !Number.isFinite(candle.close)) {
        return null;
    }
    return (Math.abs(candle.close - candle.open) / candle.open) * 100;
}
function minuteBucket(time) {
    return Math.floor(time / MINUTE_SECONDS) * MINUTE_SECONDS;
}
function candlesByMinuteBucket(candles, currentCandleStart) {
    const map = new Map();
    for (const candle of candles) {
        if (!Number.isFinite(candle.time) || candle.time >= currentCandleStart) {
            continue;
        }
        const bucket = minuteBucket(candle.time);
        const existing = map.get(bucket);
        if (existing === undefined || candle.time > existing.time) {
            map.set(bucket, candle);
        }
    }
    return map;
}
function synchronizedClosedCandles(bitpin, wallex, lookback, nowMs) {
    const nowSeconds = Math.floor(nowMs / 1000);
    const currentCandleStart = Math.floor(nowSeconds / MINUTE_SECONDS) * MINUTE_SECONDS;
    const bitpinMap = candlesByMinuteBucket(bitpin, currentCandleStart);
    const wallexMap = candlesByMinuteBucket(wallex, currentCandleStart);
    const buckets = [...bitpinMap.keys()]
        .filter((bucket) => wallexMap.has(bucket))
        .sort((a, b) => a - b);
    return buckets.slice(-Math.max(0, lookback)).map((bucket) => ({
        bitpin: bitpinMap.get(bucket),
        wallex: wallexMap.get(bucket),
    }));
}
function ratio(candles, minMovePct) {
    if (!candles.length)
        return null;
    const bullish = candles.filter((candle) => direction(candle, minMovePct) === "BULLISH").length;
    return bullish / candles.length;
}
function alignment(pairs, minMovePct) {
    if (!pairs.length)
        return null;
    const matching = pairs.filter(({ bitpin, wallex }) => {
        return direction(bitpin, minMovePct) === direction(wallex, minMovePct);
    }).length;
    return matching / pairs.length;
}
function averageDirectionalMovePct(pairs, minMovePct) {
    const moves = pairs.flatMap(({ bitpin, wallex }) => {
        const values = [];
        if (direction(bitpin, minMovePct) !== "NEUTRAL") {
            const value = movePct(bitpin);
            if (value !== null)
                values.push(value);
        }
        if (direction(wallex, minMovePct) !== "NEUTRAL") {
            const value = movePct(wallex);
            if (value !== null)
                values.push(value);
        }
        return values;
    });
    if (!moves.length)
        return null;
    return moves.reduce((sum, value) => sum + value, 0) / moves.length;
}
function momentumScore(averageMove, referencePct) {
    if (averageMove === null ||
        !Number.isFinite(averageMove) ||
        referencePct <= 0) {
        return null;
    }
    return Math.min(1, Math.max(0, averageMove / referencePct)) * 5;
}
function riskLevel(score, config) {
    if (score >= config.riskThresholds.low)
        return "LOW";
    if (score >= config.riskThresholds.medium)
        return "MEDIUM";
    if (score >= config.riskThresholds.high)
        return "HIGH";
    return "VERY_HIGH";
}
function opportunityLevel(score, wallexAboveBitpin, spread, config) {
    const above = wallexAboveBitpin.status === "SUCCESS";
    const spreadOk = spread.status === "SUCCESS";
    if (score >= config.opportunityThresholds.strong && above && spreadOk) {
        return "STRONG";
    }
    if (score >= config.opportunityThresholds.moderate && above && spreadOk) {
        return "MODERATE";
    }
    if (score >= config.opportunityThresholds.weak)
        return "WEAK";
    return "NONE";
}
function availableWeight(result, weight) {
    return result.status === "INSUFFICIENT_DATA" ? 0 : weight;
}
function analyzeOpportunity({ bitpinCandles, wallexCandles, currentPrices, externalPrice, nowMs = Date.now(), config = config_1.DEFAULT_OPPORTUNITY_CONFIG, }) {
    const bitpinPrice = normalizePositivePrice(currentPrices.bitpin);
    const wallexPrice = normalizePositivePrice(currentPrices.wallex);
    const normalizedExternal = normalizePositivePrice(externalPrice);
    const spreadAbsolute = bitpinPrice !== null && wallexPrice !== null
        ? wallexPrice - bitpinPrice
        : null;
    const spreadPercent = spreadAbsolute !== null && bitpinPrice !== null && bitpinPrice > 0
        ? (spreadAbsolute / bitpinPrice) * 100
        : null;
    const externalDeviation = normalizedExternal !== null && wallexPrice !== null
        ? (Math.abs(wallexPrice - normalizedExternal) / normalizedExternal) * 100
        : null;
    const externalValidation = externalDeviation === null
        ? insufficient(config.externalValidationPct)
        : {
            status: externalDeviation <= config.externalValidationPct
                ? "SUCCESS"
                : "FAILED",
            actual: externalDeviation,
            threshold: config.externalValidationPct,
        };
    const wallexAboveBitpin = bitpinPrice === null || wallexPrice === null
        ? insufficient()
        : {
            status: wallexPrice > bitpinPrice ? "SUCCESS" : "FAILED",
            actual: wallexPrice - bitpinPrice,
            threshold: 0,
        };
    const spreadTest = spreadPercent === null
        ? insufficient(config.spreadTriggerPct)
        : {
            status: spreadPercent >= config.spreadTriggerPct ? "SUCCESS" : "FAILED",
            actual: spreadPercent,
            threshold: config.spreadTriggerPct,
        };
    const pairs = synchronizedClosedCandles(bitpinCandles, wallexCandles, config.lookbackCandles, nowMs);
    const hasEnoughCandles = pairs.length >= config.lookbackCandles;
    const bitpinBullishRatio = hasEnoughCandles
        ? ratio(pairs.map((pair) => pair.bitpin), config.minCandleMovePct)
        : null;
    const wallexBullishRatio = hasEnoughCandles
        ? ratio(pairs.map((pair) => pair.wallex), config.minCandleMovePct)
        : null;
    const alignmentRatio = hasEnoughCandles
        ? alignment(pairs, config.minCandleMovePct)
        : null;
    const averageMove = hasEnoughCandles
        ? averageDirectionalMovePct(pairs, config.minCandleMovePct)
        : null;
    const bitpinBullish = bitpinBullishRatio === null
        ? insufficient(config.minBullishRatio)
        : classifyRatio(bitpinBullishRatio, config.minBullishRatio);
    const wallexBullish = wallexBullishRatio === null
        ? insufficient(config.minBullishRatio)
        : classifyRatio(wallexBullishRatio, config.minBullishRatio);
    const candleAlignment = alignmentRatio === null
        ? insufficient(config.minAlignmentRatio)
        : classifyRatio(alignmentRatio, config.minAlignmentRatio);
    const momentum = momentumScore(averageMove, config.momentumReferencePct);
    const momentumTest = momentum === null
        ? insufficient(config.momentumReferencePct)
        : {
            status: "SUCCESS",
            actual: momentum,
            threshold: 0,
        };
    const safeTarget = wallexPrice !== null
        ? wallexPrice * (1 - config.safetyMarginPct / 100)
        : null;
    const gross = safeTarget !== null && bitpinPrice !== null
        ? safeTarget - bitpinPrice
        : null;
    const grossPct = gross !== null && bitpinPrice !== null && bitpinPrice > 0
        ? (gross / bitpinPrice) * 100
        : null;
    const feesPct = config.takerFeePct + config.takerFeePct;
    const netPct = grossPct !== null ? grossPct - feesPct : null;
    const targetViability = netPct === null
        ? insufficient()
        : {
            status: netPct > 0 ? "SUCCESS" : "FAILED",
            actual: netPct,
            threshold: 0,
        };
    const weights = [
        {
            result: externalValidation,
            weight: config.scoreWeights.externalValidation,
        },
        {
            result: spreadTest,
            weight: config.scoreWeights.spreadQuality,
        },
        {
            result: candleAlignment,
            weight: config.scoreWeights.candleAlignment,
        },
        {
            result: bitpinBullish,
            weight: config.scoreWeights.bitpinBullishRatio,
        },
        {
            result: wallexBullish,
            weight: config.scoreWeights.wallexBullishRatio,
        },
        {
            result: momentumTest,
            weight: config.scoreWeights.momentumQuality,
        },
    ];
    const availablePoints = weights.reduce((sum, item) => sum + availableWeight(item.result, item.weight), 0);
    let earnedPoints = 0;
    for (const item of weights.slice(0, -1)) {
        if (item.result.status === "SUCCESS") {
            earnedPoints += item.weight;
            continue;
        }
        if (item.result.status === "ACCEPTABLE" &&
            item.result.actual !== null &&
            item.result.actual >= 0.5) {
            earnedPoints += item.result.actual * item.weight;
        }
    }
    if (momentum !== null) {
        earnedPoints += momentum;
    }
    const dataCompleteness = Math.round(availablePoints * 1e9) / 1e9;
    const stabilityScore = availablePoints > 0
        ? Math.round(Math.min(100, Math.max(0, (earnedPoints / availablePoints) * 100)) *
            1e9) / 1e9
        : 0;
    return {
        prices: {
            bitpin: bitpinPrice,
            wallex: wallexPrice,
            external: normalizedExternal,
        },
        spread: {
            absolute: spreadAbsolute,
            percent: spreadPercent,
        },
        validation: {
            external: externalValidation,
            wallexAboveBitpin,
            spread: spreadTest,
            candleAlignment,
            bitpinBullish,
            wallexBullish,
            targetViability,
        },
        candles: {
            lookback: config.lookbackCandles,
            synchronized: pairs.length,
            bitpinBullishRatio,
            wallexBullishRatio,
            alignmentRatio,
            averageDirectionalMovePct: averageMove,
            momentumScore: momentum,
        },
        target: {
            entryPrice: bitpinPrice,
            safeTarget,
            safetyMarginPct: config.safetyMarginPct,
            horizonMinutes: config.targetHorizonMinutes,
        },
        edge: {
            gross,
            grossPct,
            feesPct,
            netPct,
        },
        stabilityScore,
        dataCompleteness,
        riskLevel: riskLevel(stabilityScore, config),
        opportunity: opportunityLevel(stabilityScore, wallexAboveBitpin, spreadTest, config),
    };
}
