const test = require("node:test");
const assert = require("node:assert/strict");
const { buildUnifiedSignal } = require("../.test-dist/lib/research/unified-signal.js");

function opportunity({ eligible = true, decision = "BUY_CHEAP_SELL_EXPENSIVE", balance = 80, quality = "READY" } = {}) {
  return {
    eligibleForSignal: eligible,
    decision,
    decisionReason: decision === "BUY_CHEAP_SELL_EXPENSIVE" ? "Economic gate passed." : "No valid opportunity.",
    dataQuality: { status: quality, reasons: quality === "READY" ? [] : ["Reference price unavailable"] },
    stabilityScore: 90,
    candles: {
      stabilitySelected: Array.from({ length: 10 }, (_, index) => ({
        timestamp: 1_000_000 + index * 60,
        bitpin: { timestamp: 1_000_000 + index * 60, open: 100, close: 101, movementPct: 1, direction: "BULLISH" },
        wallex: { timestamp: 1_000_000 + index * 60, open: 100, close: 101, movementPct: 1, direction: "BULLISH" },
      })),
    },
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
function longForecast(direction24 = "UP", direction7d = "UP", age = 60) {
  return {
    generatedAt: new Date(1_000_000).toISOString(),
    model: "hourly-multi-factor-walk-forward-v1",
    synchronizedHourlyCandles: 9000,
    candleAgeSeconds: age,
    dataStatus: "READY",
    forecasts: [
      { horizonHours: 24, direction: direction24, score: direction24 === "UP" ? 45 : direction24 === "DOWN" ? -45 : 0, expectedReturnPct: 0.4, historicalHitRate: 0.6, calibrationSamples: 100, support: 98, resistance: 102, breakout: "INSIDE_RANGE", dataStatus: "READY" },
      { horizonHours: 168, direction: direction7d, score: direction7d === "UP" ? 35 : direction7d === "DOWN" ? -35 : 0, expectedReturnPct: 1.2, historicalHitRate: 0.58, calibrationSamples: 80, support: 98, resistance: 102, breakout: "INSIDE_RANGE", dataStatus: "READY" },
    ],
    backtest: { method: "test", costPerRoundTripPct: 0.2, split: "CHRONOLOGICAL_FINAL_20_PERCENT", metrics: [] },
  };
}

function backtest(valid = true) {
  return {
    generatedAt: new Date(1_000_000).toISOString(),
    method: "multi-feature-regime-v1",
    input: { bitpinCandles: 1000, wallexCandles: 1000, synchronizedCandles: 1000 },
    split: { trainPct: 60, tunePct: 20, testPct: 20, chronological: true },
    assumptions: { momentumLookbackMinutes: 30, minimumMomentumPct: 0.015, flatThresholdPct: 0.02, costPerRoundTripPct: 0.2, outcomePrice: "Bitpin close", futureDataUsedForPrediction: false },
    metrics: [5, 15, 30, 60].map((horizonMinutes) => ({
      horizonMinutes, samples: 1000, trainSamples: 600, tuneSamples: 200, testSamples: 200,
      testSampleStatus: "EVALUATED",
      testDirectionalAccuracy: valid ? 0.65 : 0.48,
      testBaselineAccuracy: 0.50,
      testMeanAbsoluteErrorPct: 0.1,
      testBaselineMeanAbsoluteErrorPct: 0.2,
      testGrossStrategyReturnPct: valid ? 0.5 : -0.1,
      testNetStrategyReturnPct: valid ? 0.3 : -0.3,
      testWinRate: valid ? 0.60 : 0.40,
      costPerRoundTripPct: 0.2,
    })),
    samples: [],
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
    priceLevels: { support: 98, resistance: 102, supportDistancePct: 2.04, resistanceDistancePct: 1.96, breakout: "INSIDE_RANGE", lookbackCandles: 60 },
    entryTiming: "CONTINUATION_WATCH",
    entryReason: "Test",
    exitTiming: "HOLD_TREND",
    exitReason: "Test",
    regimeReason: "Test",
    backtest: { method: "test", costPerRoundTripPct: 0.2, futureDataUsedForPrediction: false, horizons: [] },
  };
}

test("aligned bullish evidence plus valid Opportunity opens only the research route", () => {
  const result = buildUnifiedSignal({ opportunity: opportunity(), forecast: forecast(), trend: trend(), longForecast: longForecast(), backtest: backtest(), nowMs: 1_000_000 });
  assert.equal(result.direction, "BULLISH");
  assert.equal(result.action, "BUY_CHEAP_SELL_EXPENSIVE");
});

test("bearish forecast cannot be overridden by a positive Opportunity spread", () => {
  const result = buildUnifiedSignal({
    opportunity: opportunity({ balance: 20 }),
    forecast: forecast({ 5: -55, 15: -50, 30: -35, 60: -25 }),
    trend: trend(-45, "BEARISH"),
    longForecast: longForecast(),
    backtest: backtest(),
    nowMs: 1_000_000,
  });
  assert.equal(result.direction, "CONFLICT");
  assert.equal(result.action, "WAIT_FOR_CONFIRMATION");
  assert.ok(result.horizons.some((row) => row.conflictReasons.some((reason) => reason.includes("breakout") || reason.includes("Forecast and Buy/Sell Balance") || reason.includes("Wallex-to-Bitpin"))));
});

test("forecast versus Buy/Sell disagreement is marked as conflict and blocks trade", () => {
  const result = buildUnifiedSignal({
    opportunity: opportunity({ balance: 20 }),
    forecast: forecast(),
    trend: trend(),
    longForecast: longForecast(),
    backtest: backtest(),
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
    longForecast: longForecast(),
    backtest: backtest(),
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
    longForecast: longForecast(),
    backtest: backtest(),
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
    longForecast: longForecast(),
    backtest: backtest(),
    nowMs: 1_000_000,
  });
  assert.equal(result.horizons.find((row) => row.horizonMinutes === 15).trendScore, null);
  assert.notEqual(result.action, "BUY_CHEAP_SELL_EXPENSIVE");
});

test("confirmed opposite breakout creates a structural conflict instead of being ignored", () => {
  const bullishTrend = trend(45, "BULLISH");
  bullishTrend.priceLevels = { support: 98, resistance: 102, supportDistancePct: 2, resistanceDistancePct: 2, breakout: "BREAKDOWN_CONFIRMED", lookbackCandles: 60 };
  const result = buildUnifiedSignal({
    opportunity: opportunity(),
    forecast: forecast({ 5: 55, 15: 50, 30: 35, 60: 25 }),
    trend: bullishTrend,
    longForecast: longForecast(),
    backtest: backtest(),
    nowMs: 1_000_000,
  });
  assert.equal(result.horizons.find((row) => row.horizonMinutes === 15).direction, "CONFLICT");
  assert.ok(result.horizons.find((row) => row.horizonMinutes === 15).conflictReasons.some((reason) => reason.includes("breakout")));
});

test("opposing 24-hour and 7-day forecasts create a higher-timeframe conflict", () => {
  const result = buildUnifiedSignal({
    opportunity: opportunity(),
    forecast: forecast(),
    trend: trend(),
    longForecast: longForecast("UP", "DOWN"),
    backtest: backtest(),
    nowMs: 1_000_000,
  });
  assert.equal(result.higherTimeframeDirection, "CONFLICT");
  assert.equal(result.direction, "CONFLICT");
  assert.equal(result.action, "WAIT_FOR_CONFIRMATION");
});

test("a backtest without a positive after-cost edge over baseline blocks signal clearance", () => {
  const result = buildUnifiedSignal({
    opportunity: opportunity(),
    forecast: forecast(),
    trend: trend(),
    longForecast: longForecast(),
    backtest: backtest(false),
    nowMs: 1_000_000,
  });
  assert.equal(result.backtestValidated, false);
  assert.equal(result.action, "WAIT_FOR_CONFIRMATION");
  assert.ok(result.blockers.some((reason) => reason.includes("Out-of-sample edge")));
});
