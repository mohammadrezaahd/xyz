import type { Candle } from "../candles";
import { DEFAULT_OPPORTUNITY_CONFIG, type OpportunityConfig, type OpportunityDecision } from "./config";
import type { CandleDirection, ExternalReferencePrice, OpportunityAnalysis, OpportunityLevel, RiskLevel, TestResult } from "./types";


const MINUTE_SECONDS = 60;
const STABILITY_LOOKBACK_CANDLES = 10;
const STABILITY_MIN_CANDLE_MOVE_PCT = 0.05;
function quoteAgeMs(fetchedAt: number | null | undefined, nowMs: number): number | null {
  return typeof fetchedAt === "number" && Number.isFinite(fetchedAt) ? Math.max(0, nowMs - fetchedAt) : null;
}

function insufficient(threshold: number | null = null): TestResult {
  return { status: "INSUFFICIENT_DATA", actual: null, threshold };
}
function normalizePositivePrice(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}
function classifyRatio(actual: number, threshold: number): TestResult {
  return { status: actual >= threshold ? "SUCCESS" : actual >= 0.5 ? "ACCEPTABLE" : "FAILED", actual, threshold };
}
function classifySpread(actual: number, threshold: number): TestResult {
  return { status: actual >= threshold ? "SUCCESS" : actual >= threshold * 0.5 ? "ACCEPTABLE" : "FAILED", actual, threshold };
}
function movementPct(candle: Candle): number | null {
  if (!Number.isFinite(candle.open) || candle.open <= 0 || !Number.isFinite(candle.close)) return null;
  return (Math.abs(candle.close - candle.open) / candle.open) * 100;
}
function classifyCandle(candle: Candle, minMovePct: number): { direction: CandleDirection; movementPct: number | null } {
  const movement = movementPct(candle);
  if (movement === null || movement < minMovePct) return { direction: "NEUTRAL", movementPct: movement };
  return { direction: candle.close > candle.open ? "BULLISH" : "BEARISH", movementPct: movement };
}
function minuteBucket(time: number): number { return Math.floor(time / MINUTE_SECONDS) * MINUTE_SECONDS; }
function synchronizedClosedCandles(bitpin: Candle[], wallex: Candle[], lookback: number, nowMs: number) {
  const currentStart = Math.floor(Math.floor(nowMs / 1000) / MINUTE_SECONDS) * MINUTE_SECONDS;
  const byBucket = (candles: Candle[]) => {
    const map = new Map<number, Candle>();
    for (const candle of candles) {
      if (!Number.isFinite(candle.time) || candle.time >= currentStart || candle.time % MINUTE_SECONDS !== 0) continue;
      const bucket = minuteBucket(candle.time);
      const existing = map.get(bucket);
      if (!existing || candle.time > existing.time) map.set(bucket, candle);
    }
    return map;
  };
  const b = byBucket(bitpin); const w = byBucket(wallex);
  return [...b.keys()].filter((key) => w.has(key)).sort((a, z) => a - z).slice(-Math.max(0, lookback)).map((key) => ({ bitpin: b.get(key)!, wallex: w.get(key)! }));
}
function ratio(candles: Candle[], minMovePct: number, wanted: CandleDirection): number | null {
  if (!candles.length) return null;
  return candles.filter((candle) => classifyCandle(candle, minMovePct).direction === wanted).length / candles.length;
}
function selectedCandle(timestamp: number, candle: Candle, minMovePct: number) {
  const c = classifyCandle(candle, minMovePct);
  return { timestamp, open: candle.open, close: candle.close, movementPct: c.movementPct ?? 0, direction: c.direction } as const;
}
function legacyAlignment(pairs: Array<{ bitpin: Candle; wallex: Candle }>, minMovePct: number): number | null {
  if (!pairs.length) return null;
  return pairs.filter((pair) => classifyCandle(pair.bitpin, minMovePct).direction === classifyCandle(pair.wallex, minMovePct).direction).length / pairs.length;
}
function directionalMetrics(pairs: Array<{ bitpin: Candle; wallex: Candle }>, minMovePct: number) {
  if (!pairs.length) return { agreement: null, participation: null, neutralPair: null };
  let directional = 0; let bothDirectional = 0; let agreeing = 0; let neutralPairs = 0;
  for (const pair of pairs) {
    const a = classifyCandle(pair.bitpin, minMovePct).direction;
    const b = classifyCandle(pair.wallex, minMovePct).direction;
    if (a === "NEUTRAL" && b === "NEUTRAL") neutralPairs += 1;
    if (a !== "NEUTRAL" || b !== "NEUTRAL") directional += 1;
    if (a !== "NEUTRAL" && b !== "NEUTRAL") { bothDirectional += 1; if (a === b) agreeing += 1; }
  }
  return { agreement: bothDirectional ? agreeing / bothDirectional : null, participation: directional / pairs.length, neutralPair: neutralPairs / pairs.length };
}
function averageDirectionalMovePct(pairs: Array<{ bitpin: Candle; wallex: Candle }>, minMovePct: number): number | null {
  const values = pairs.flatMap(({ bitpin, wallex }) => [bitpin, wallex].flatMap((candle) => classifyCandle(candle, minMovePct).direction === "NEUTRAL" ? [] : [movementPct(candle)]).filter((value): value is number => value !== null));
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}
function momentumScore(averageMove: number | null, reference: number): number | null {
  return averageMove === null || reference <= 0 ? null : Math.min(1, Math.max(0, averageMove / reference)) * 5;
}
function riskLevel(score: number, config: OpportunityConfig): RiskLevel {
  if (score >= config.riskThresholds.low) return "LOW";
  if (score >= config.riskThresholds.medium) return "MEDIUM";
  if (score >= config.riskThresholds.high) return "HIGH";
  return "VERY_HIGH";
}
function round(value: number): number { return Math.round(value * 1e9) / 1e9; }
function balanceLabel(value: number | null, config: OpportunityConfig): "BUY BIAS" | "SELL BIAS" | "BALANCED" | "INSUFFICIENT DATA" {
  if (value === null) return "INSUFFICIENT DATA";
  if (value >= config.balanceThresholds.buy) return "BUY BIAS";
  if (value <= config.balanceThresholds.sell) return "SELL BIAS";
  return "BALANCED";
}

export function analyzeOpportunity({
  bitpinCandles, wallexCandles, currentPrices, externalPrice, externalReference, nowMs = Date.now(), config = DEFAULT_OPPORTUNITY_CONFIG,
}: {
  bitpinCandles: Candle[];
  wallexCandles: Candle[];
  currentPrices: { bitpin: number | null | undefined | { price: number | null; fetchedAt: number | null }; wallex: number | null | undefined | { price: number | null; fetchedAt: number | null }; fetchedAt?: number | null };
  externalPrice?: number | null;
  externalReference?: ExternalReferencePrice | null;
  nowMs?: number;
  config?: OpportunityConfig;
}): OpportunityAnalysis {
  const bitpinQuote = typeof currentPrices.bitpin === "object" && currentPrices.bitpin !== null ? currentPrices.bitpin : { price: currentPrices.bitpin, fetchedAt: currentPrices.fetchedAt ?? null };
  const wallexQuote = typeof currentPrices.wallex === "object" && currentPrices.wallex !== null ? currentPrices.wallex : { price: currentPrices.wallex, fetchedAt: currentPrices.fetchedAt ?? null };
  const bitpinPrice = normalizePositivePrice(bitpinQuote.price);
  const wallexPrice = normalizePositivePrice(wallexQuote.price);
  const reference: ExternalReferencePrice = externalReference ?? (externalPrice === undefined ? { price: null, fetchedAt: null, provider: null, error: "Independent external reference is not configured" } : { price: externalPrice ?? null, fetchedAt: nowMs, provider: "manual-reference", error: null });
  const normalizedExternal = normalizePositivePrice(reference.price);
  const bitpinAgeMs = quoteAgeMs(bitpinQuote.fetchedAt, nowMs);
  const wallexAgeMs = quoteAgeMs(wallexQuote.fetchedAt, nowMs);
  const externalAgeMs = quoteAgeMs(reference.fetchedAt, nowMs);
  const spreadAbsolute = bitpinPrice !== null && wallexPrice !== null ? wallexPrice - bitpinPrice : null;
  const spreadPercent = spreadAbsolute !== null && bitpinPrice ? (spreadAbsolute / bitpinPrice) * 100 : null;
  const externalDeviation = normalizedExternal !== null && wallexPrice !== null ? Math.abs(wallexPrice - normalizedExternal) / normalizedExternal * 100 : null;
  const externalValidation = externalDeviation === null ? insufficient(config.externalValidationPct) : { status: externalDeviation <= config.externalValidationPct ? "SUCCESS" : "FAILED", actual: externalDeviation, threshold: config.externalValidationPct } as TestResult;
  const wallexAboveBitpin = bitpinPrice === null || wallexPrice === null ? insufficient() : { status: wallexPrice > bitpinPrice ? "SUCCESS" : "FAILED", actual: wallexPrice - bitpinPrice, threshold: 0 } as TestResult;
  const spreadTest = spreadPercent === null ? insufficient(config.spreadTriggerPct) : classifySpread(spreadPercent, config.spreadTriggerPct);
  const rawPairs = synchronizedClosedCandles(bitpinCandles, wallexCandles, Number.MAX_SAFE_INTEGER, nowMs);
  const pairs = rawPairs.slice(-config.lookbackCandles);
  const stabilityPairs = rawPairs.slice(-STABILITY_LOOKBACK_CANDLES);
  const synchronizedAvailable = rawPairs.length;
  const synchronizedUsed = pairs.length;
  const enoughPairs = synchronizedAvailable >= config.minimumCandlePairs && synchronizedUsed >= config.minimumCandlePairs;
  const enoughForLegacyMetrics = stabilityPairs.length >= STABILITY_LOOKBACK_CANDLES;
  // Preserve main's Stability Score definition: last 10 synchronized closed pairs,
  // 0.05% minimum candle move, and neutral/neutral pairs count as aligned.
  const bitpinBullishRatio = enoughForLegacyMetrics ? ratio(stabilityPairs.map((p) => p.bitpin), STABILITY_MIN_CANDLE_MOVE_PCT, "BULLISH") : null;
  const wallexBullishRatio = enoughForLegacyMetrics ? ratio(stabilityPairs.map((p) => p.wallex), STABILITY_MIN_CANDLE_MOVE_PCT, "BULLISH") : null;
  const bitpinBearishRatio = enoughForLegacyMetrics ? ratio(stabilityPairs.map((p) => p.bitpin), STABILITY_MIN_CANDLE_MOVE_PCT, "BEARISH") : null;
  const wallexBearishRatio = enoughForLegacyMetrics ? ratio(stabilityPairs.map((p) => p.wallex), STABILITY_MIN_CANDLE_MOVE_PCT, "BEARISH") : null;
  const legacyAlignmentRatio = enoughForLegacyMetrics ? legacyAlignment(stabilityPairs, STABILITY_MIN_CANDLE_MOVE_PCT) : null;
  const directional = enoughPairs ? directionalMetrics(pairs, config.minCandleMovePct) : { agreement: null, participation: null, neutralPair: null };
  const averageMove = enoughForLegacyMetrics ? averageDirectionalMovePct(stabilityPairs, STABILITY_MIN_CANDLE_MOVE_PCT) : null;
  const directionalBitpinBullishRatio = enoughPairs ? ratio(pairs.map((p) => p.bitpin), config.minCandleMovePct, "BULLISH") : null;
  const directionalWallexBullishRatio = enoughPairs ? ratio(pairs.map((p) => p.wallex), config.minCandleMovePct, "BULLISH") : null;
  const directionalBitpinBearishRatio = enoughPairs ? ratio(pairs.map((p) => p.bitpin), config.minCandleMovePct, "BEARISH") : null;
  const directionalWallexBearishRatio = enoughPairs ? ratio(pairs.map((p) => p.wallex), config.minCandleMovePct, "BEARISH") : null;
  const bitpinBullish = bitpinBullishRatio === null ? insufficient(config.minBullishRatio) : classifyRatio(bitpinBullishRatio, config.minBullishRatio);
  const wallexBullish = wallexBullishRatio === null ? insufficient(config.minBullishRatio) : classifyRatio(wallexBullishRatio, config.minBullishRatio);
  const candleAlignment = legacyAlignmentRatio === null ? insufficient(config.minAlignmentRatio) : classifyRatio(legacyAlignmentRatio, config.minAlignmentRatio);
  const momentum = momentumScore(averageMove, config.momentumReferencePct);
  const momentumTest = momentum === null ? insufficient(config.momentumReferencePct) : { status: "SUCCESS", actual: momentum, threshold: 0 } as TestResult;
  const safeTarget = wallexPrice !== null ? wallexPrice * (1 - config.safetyMarginPct / 100) : null;
  const totalCostPct = config.executionCosts.takerEntryFeePct + config.executionCosts.takerExitFeePct + config.executionCosts.slippageBufferPct + config.executionCosts.latencyBufferPct + config.executionCosts.transferCostPct;
  const gross = safeTarget !== null && bitpinPrice !== null ? safeTarget - bitpinPrice : null;
  const grossPct = gross !== null && bitpinPrice ? gross / bitpinPrice * 100 : null;
  const legacyNetPct = grossPct === null ? null : grossPct - (config.takerFeePct + config.takerFeePct);
  const netPct = grossPct === null ? null : grossPct - totalCostPct;
  const expectedNetProfit = gross === null || bitpinPrice === null || netPct === null ? null : bitpinPrice * netPct / 100;
  const targetViability = legacyNetPct === null ? insufficient() : { status: legacyNetPct > 0 ? "SUCCESS" : "FAILED", actual: legacyNetPct, threshold: 0 } as TestResult;
  const weights = [
    [externalValidation, config.scoreWeights.externalValidation], [spreadTest, config.scoreWeights.spreadQuality], [candleAlignment, config.scoreWeights.candleAlignment], [bitpinBullish, config.scoreWeights.bitpinBullishRatio], [wallexBullish, config.scoreWeights.wallexBullishRatio], [momentumTest, config.scoreWeights.momentumQuality],
  ] as const;
  const availablePoints = weights.reduce((sum, [result, weight]) => sum + (result.status === "INSUFFICIENT_DATA" ? 0 : weight), 0);
  const earnedPoints = weights.reduce((sum, [result, weight], index) => sum + (result.status === "SUCCESS" ? (index === 5 && result.actual !== null ? result.actual : weight) : result.status === "ACCEPTABLE" && result.actual !== null ? (index === 5 ? result.actual : result.actual * weight) : 0), 0);
  const dataCompleteness = round(availablePoints);
  const stabilityScore = availablePoints ? round(Math.min(100, Math.max(0, earnedPoints / availablePoints * 100))) : 0;
  const qualityMultiplier = directional.agreement !== null && directional.participation !== null ? (directional.agreement + directional.participation) / 2 : null;
  const bullishPairCount = pairs.filter((pair) => classifyCandle(pair.bitpin, config.minCandleMovePct).direction === "BULLISH" && classifyCandle(pair.wallex, config.minCandleMovePct).direction === "BULLISH").length;
  const bearishPairCount = pairs.filter((pair) => classifyCandle(pair.bitpin, config.minCandleMovePct).direction === "BEARISH" && classifyCandle(pair.wallex, config.minCandleMovePct).direction === "BEARISH").length;
  const directionalMomentumScore = enoughPairs ? momentumScore(averageDirectionalMovePct(pairs, config.minCandleMovePct), config.momentumReferencePct) : null;
  const directionalMomentum = directionalMomentumScore === null ? null : directionalMomentumScore / 5;
  const buyValues = [directionalBitpinBullishRatio, directionalWallexBullishRatio, bullishPairCount > bearishPairCount ? directionalMomentum : null, spreadPercent !== null && spreadPercent > 0 ? Math.min(1, spreadPercent / config.spreadTriggerPct) : null].filter((value): value is number => value !== null && Number.isFinite(value));
  const sellValues = [directionalBitpinBearishRatio, directionalWallexBearishRatio, bearishPairCount > bullishPairCount ? directionalMomentum : null, spreadPercent !== null && spreadPercent < 0 ? Math.min(1, Math.abs(spreadPercent) / config.spreadTriggerPct) : null].filter((value): value is number => value !== null && Number.isFinite(value));
  const directionalBalanceAvailable = enoughPairs && directional.agreement !== null && directional.participation !== null && directional.participation >= config.minimumDirectionalParticipationRatio;
  const buyScore = directionalBalanceAvailable && qualityMultiplier !== null && buyValues.length ? (buyValues.reduce((a, b) => a + b, 0) / buyValues.length) * qualityMultiplier : null;
  const sellScore = directionalBalanceAvailable && qualityMultiplier !== null && sellValues.length ? (sellValues.reduce((a, b) => a + b, 0) / sellValues.length) * qualityMultiplier : null;
  const balance = directionalBalanceAvailable && buyScore !== null && sellScore !== null && buyScore + sellScore > 0 ? round(100 * buyScore / (buyScore + sellScore)) : null;
  const label = balanceLabel(balance, config);
  const stale = bitpinAgeMs === null || wallexAgeMs === null || externalAgeMs === null || bitpinAgeMs > config.maxQuoteAgeMs || wallexAgeMs > config.maxQuoteAgeMs || externalAgeMs > config.maxQuoteAgeMs;
  const dataQualityReasons: string[] = [];
  if (rawPairs.length < config.minimumCandlePairs) dataQualityReasons.push(`Only ${synchronizedAvailable} of ${config.minimumCandlePairs} required synchronized candle pairs are available`);
  if (rawPairs.length >= config.minimumCandlePairs && (directional.participation === null || directional.participation < config.minimumDirectionalParticipationRatio)) dataQualityReasons.push("Directional participation cannot be confirmed");
  if (normalizedExternal === null) dataQualityReasons.push("Reference price unavailable");
  if (bitpinPrice === null) dataQualityReasons.push("Bitpin ticker unavailable");
  if (wallexPrice === null) dataQualityReasons.push("Wallex ticker unavailable");
  if (stale && dataQualityReasons.length === 0) dataQualityReasons.push("One or more required market quotes are stale");
  const dataQuality = { status: dataQualityReasons.length === 0 ? "READY" as const : stale && !dataQualityReasons.some((reason) => reason.includes("candle") || reason.includes("participation") || reason.includes("unavailable")) ? "STALE" as const : "INCOMPLETE" as const, reasons: dataQualityReasons };
  const requiredDataMissing = dataQualityReasons.length > 0;
  const invalidTarget = safeTarget === null || bitpinPrice === null || safeTarget <= bitpinPrice || (bitpinPrice * (1 + totalCostPct / 100) > safeTarget);
  const negativeEdge = netPct === null || expectedNetProfit === null || netPct <= config.executionCosts.minimumNetEdgePct || expectedNetProfit < config.executionCosts.minimumAbsoluteProfit;
  let decision: OpportunityDecision = "WATCH"; let decisionReason = "Evidence is available but the route is not yet eligible.";
  if (stale) { decision = "NO_TRADE_STALE_QUOTE"; decisionReason = "A required market or external reference quote is stale."; }
  else if (requiredDataMissing) { decision = "NO_TRADE_INSUFFICIENT_DATA"; decisionReason = "Required independent reference, candle history, or directional participation is incomplete."; }
  else if (wallexPrice !== null && bitpinPrice !== null && wallexPrice <= bitpinPrice) { decision = "NO_TRADE_DIRECTION_CONFLICT"; decisionReason = "Wallex is not richer than Bitpin for the supported long spread route."; }
  else if (invalidTarget) { decision = "NO_TRADE_INVALID_TARGET"; decisionReason = "The fee-adjusted target is not strictly above entry and break-even."; }
  else if (negativeEdge) { decision = "NO_TRADE_NEGATIVE_EDGE"; decisionReason = "Expected profit after fees and configured execution buffers is below the minimum."; }
  else if (stabilityScore < config.opportunityThresholds.moderate) { decision = "WATCH"; decisionReason = "The route is economic but stability evidence is below the activation threshold."; }
  else { decision = "BUY_CHEAP_SELL_EXPENSIVE"; decisionReason = "The long spread route passes data-quality, direction, target, and economic gates."; }
  const eligibleForSignal = decision === "BUY_CHEAP_SELL_EXPENSIVE";
  const opportunity: OpportunityLevel = eligibleForSignal ? stabilityScore >= config.opportunityThresholds.strong ? "STRONG" : "MODERATE" : "NONE";
  return {
    prices: { bitpin: bitpinPrice, wallex: wallexPrice, external: normalizedExternal },
    spread: { absolute: spreadAbsolute, percent: spreadPercent },
    validation: { external: externalValidation, wallexAboveBitpin, spread: spreadTest, candleAlignment, bitpinBullish, wallexBullish, targetViability, momentum: momentumTest },
    candles: { bitpinReceived: bitpinCandles.length, wallexReceived: wallexCandles.length, synchronizedAvailable, synchronizedUsed, minimumRequired: config.minimumCandlePairs, lookbackLimit: config.lookbackCandles, currentCandleExcluded: true, lookback: config.lookbackCandles, stabilityLookback: STABILITY_LOOKBACK_CANDLES, synchronized: synchronizedAvailable, selected: pairs.map(({ bitpin, wallex }) => ({ timestamp: minuteBucket(bitpin.time), bitpin: selectedCandle(minuteBucket(bitpin.time), bitpin, config.minCandleMovePct), wallex: selectedCandle(minuteBucket(wallex.time), wallex, config.minCandleMovePct) })), bitpinBullishRatio, wallexBullishRatio, alignmentRatio: legacyAlignmentRatio, directionalAgreementRatio: directional.agreement, directionalParticipationRatio: directional.participation, neutralPairRatio: directional.neutralPair, averageDirectionalMovePct: averageMove, momentumScore: momentum },
    target: { entryPrice: bitpinPrice, safeTarget, safetyMarginPct: config.safetyMarginPct, horizonMinutes: config.targetHorizonMinutes },
    edge: { gross, grossPct, feesPct: config.takerFeePct + config.takerFeePct, slippagePct: config.executionCosts.slippageBufferPct, latencyPct: config.executionCosts.latencyBufferPct, transferCostPct: config.executionCosts.transferCostPct, netPct: legacyNetPct, expectedNetProfit, executionNetPct: netPct },
    stabilityScore, dataCompleteness, riskLevel: riskLevel(stabilityScore, config), opportunity, decision, decisionReason, eligibleForSignal, minimumRequiredCandlePairs: config.minimumCandlePairs, dataQuality,
    buySellBalance: { value: balance, buyScore: buyScore === null ? null : round(buyScore * 100), sellScore: sellScore === null ? null : round(sellScore * 100), label, explanation: label === "INSUFFICIENT DATA" ? "Directional evidence is incomplete; this is not a measured balance." : "Directional evidence only · not a calibrated probability of success.", executionRoute: eligibleForSignal ? "LONG" : "NONE", executionEligible: eligibleForSignal },
    quoteFreshness: { bitpinAgeMs, wallexAgeMs, externalAgeMs }, configurationVersion: config.version, engineVersion: config.engineVersion, executionCostVersion: config.executionCostVersion, executionCosts: config.executionCosts,
  };
}
