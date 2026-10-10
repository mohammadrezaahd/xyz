const test = require("node:test");
const assert = require("node:assert/strict");
const { buildUnifiedSignal } = require("../.test-dist/lib/research/unified-signal.js");

function opportunity({ eligible = true, decision = "BUY_CHEAP_SELL_EXPENSIVE", balance = 80, quality = "READY" } = {}) {
  return {
    eligibleForSignal: eligible,
    decision,
    decisionReason: decision === "BUY_CHEAP_SELL_EXPENSIVE" ? "Economic gate passed." : "No valid opportunity.",
    dataQuality: { status: quality, reasons: quality === "READY" ? [] : ["Reference price unavailable"] },
    buySellBalance: { value: balance },
  };
}
function forecast(scores = { 5: 55, 15: 50, 30: 35, 60: 25 }, age = 20) {
  return {
    generatedAt: new Date(1_000_000).toISOString(),
    model: "multi-feature-regime-v1",
    warning: "Research only",
    synchronizedCandles: 500,
    latestCandleTime: 999_900,
    candleAgeSeconds: age,
    forecasts: [5, 15, 30, 60].map((horizonMinutes) => ({
      horizonMinutes,
      direction: scores[horizonMinutes] >= 12 ? "UP" : scores[horizonMinutes] <= -12 ? "DOWN" : "FLAT",
      score: scores[horizonMinutes],
      historicalHitRate: null,
      calibrationSamples: 0,
      expectedReturnPct: null,
      momentum5Pct: 0,
      momentum15Pct: 0,
      momentum30Pct: 0,
      realizedVolatility15Pct: 0,
      venueAgreement: 1,
      momentumAccelerationPct: 0,
      volumePressure5Pct: null,
      dataStatus: "READY",
      explanation: "Test fixture",
    })),
  };
}
function trend(score = 45, direction = "BULLISH", age = 20) {
  return {
    generatedAt: new Date(1_000_000).toISOString(),
    model: "multi-timeframe-persistence-v1",
    warning: "Research only",
    dataStatus: "READY",
    synchronizedCandles: 500,
    latestCandleTime: 999_900,
    candleAgeSeconds: age,
    price: 100,
    direction,
    rawDirection: direction === "BEARISH" ? "BEARISH" : "BULLISH",
    score,
    persistenceVotes: { bullish: 4, bearish: 0, range: 0, window: 4 },
    momentum: { return15Pct: 0.1, return60Pct: 0.2, return180Pct: 0.3, return360Pct: 0.4, volatility60Pct: 0.01 },
    structure: "HIGHER_HIGHS_HIGHER_LOWS",
    entryTiming: "CONTINUATION_WATCH",
    entryReason: "Test",
    exitTiming: "HOLD_TREND",
    exitReason: "Test",
    regimeReason: "Test",
    backtest: { method: "test", costPerRoundTripPct: 0.2, futureDataUsedForPrediction: false, horizons: [] },
  };
}

test("aligned bullish evidence plus valid Opportunity opens only the research route", () => {
  const result = buildUnifiedSignal({ opportunity: opportunity(), forecast: forecast(), trend: trend(), nowMs: 1_000_000 });
  assert.equal(result.direction, "BULLISH");
  assert.equal(result.action, "BUY_CHEAP_SELL_EXPENSIVE");
});

test("bearish forecast cannot be overridden by a positive Opportunity spread", () => {
  const result = buildUnifiedSignal({
    opportunity: opportunity(),
    forecast: forecast({ 5: -55, 15: -50, 30: -35, 60: -25 }),
    trend: trend(-45, "BEARISH"),
    nowMs: 1_000_000,
  });
  assert.equal(result.direction, "BEARISH");
  assert.equal(result.action, "WAIT_FOR_CONFIRMATION");
  assert.ok(result.blockers.some((reason) => reason.includes("Bearish")));
});

test("forecast versus Buy/Sell disagreement is marked as conflict and blocks trade", () => {
  const result = buildUnifiedSignal({
    opportunity: opportunity({ balance: 20 }),
    forecast: forecast(),
    trend: trend(),
    nowMs: 1_000_000,
  });
  assert.equal(result.horizons.find((row) => row.horizonMinutes === 15).direction, "CONFLICT");
  assert.equal(result.action, "WAIT_FOR_CONFIRMATION");
});

test("Opportunity failure blocks an otherwise bullish forecast", () => {
  const result = buildUnifiedSignal({
    opportunity: opportunity({ eligible: false, decision: "NO_TRADE_NEGATIVE_EDGE" }),
    forecast: forecast(),
    trend: trend(),
    nowMs: 1_000_000,
  });
  assert.equal(result.direction, "BULLISH");
  assert.equal(result.action, "NO_TRADE");
});

test("stale forecast or trend is not allowed to produce a tradable signal", () => {
  const result = buildUnifiedSignal({
    opportunity: opportunity(),
    forecast: forecast({ 5: 55, 15: 50, 30: 35, 60: 25 }, 600),
    trend: trend(),
    nowMs: 1_000_000,
  });
  assert.equal(result.action, "INSUFFICIENT_DATA");
  assert.ok(result.blockers.some((reason) => reason.includes("stale")));
});

test("a reversal-watch regime is excluded from trend weighting", () => {
  const result = buildUnifiedSignal({
    opportunity: opportunity(),
    forecast: forecast(),
    trend: trend(55, "REVERSAL_WATCH"),
    nowMs: 1_000_000,
  });
  assert.equal(result.horizons.find((row) => row.horizonMinutes === 15).trendScore, null);
});
