const test = require("node:test");
const assert = require("node:assert/strict");
const { analyzeOpportunity } = require("../.test-dist/lib/opportunity/engine.js");
const { GATED_ALGORITHM_VERSION, GATED_CONFIGURATION_VERSION } = require("../.test-dist/lib/opportunity/config.js");

const nowMs = 2_000_000;
function candle(time, direction = "up") {
  const open = 270000;
  const close = direction === "up" ? 270270 : direction === "down" ? 269730 : 270000;
  return { time, open, high: Math.max(open, close), low: Math.min(open, close), close };
}
function candles(direction = "up", count = 20) {
  return Array.from({ length: count }, (_, index) => candle((index + 1) * 60, direction));
}
function analysis(overrides = {}) {
  return analyzeOpportunity({
    bitpinCandles: candles(),
    wallexCandles: candles(),
    currentPrices: { bitpin: 270000, wallex: 290000, fetchedAt: nowMs },
    externalReference: { price: 290000, fetchedAt: nowMs, provider: "independent-reference", error: null },
    nowMs,
    ...overrides,
  });
}

test("the engine never treats Wallex as an independent external reference", () => {
  const result = analysis({ externalReference: { price: 290000, fetchedAt: nowMs, provider: "wallex", error: null } });
  assert.equal(result.validation.external.status, "INSUFFICIENT_DATA");
  assert.equal(result.decision, "NO_TRADE_INSUFFICIENT_DATA");
  assert.equal(result.eligibleForSignal, false);
});

test("stale market or reference quotes are a hard no-trade decision", () => {
  const result = analysis({
    currentPrices: { bitpin: 270000, wallex: 290000, fetchedAt: nowMs - 120000 },
    externalReference: { price: 290000, fetchedAt: nowMs - 120000, provider: "independent-reference", error: null },
  });
  assert.equal(result.decision, "NO_TRADE_STALE_QUOTE");
  assert.equal(result.eligibleForSignal, false);
  assert.ok(result.quoteFreshness.externalAgeMs > 90000);
});

test("neutral/neutral pairs do not count as directional agreement", () => {
  const result = analysis({ bitpinCandles: candles("neutral"), wallexCandles: candles("neutral") });
  assert.equal(result.candles.alignmentRatio, 1, "legacy display remains available for old records");
  assert.equal(result.candles.directionalAgreementRatio, null);
  assert.equal(result.candles.directionalParticipationRatio, 0);
  assert.equal(result.buySellBalance.label, "INSUFFICIENT DATA");
  assert.equal(result.decision, "NO_TRADE_INSUFFICIENT_DATA");
});

test("target and net-edge gates reject a target at or below break-even", () => {
  const result = analysis({ currentPrices: { bitpin: 289500, wallex: 290000, fetchedAt: nowMs } });
  assert.equal(result.decision, "NO_TRADE_INVALID_TARGET");
  assert.equal(result.eligibleForSignal, false);
  assert.ok((result.edge.executionNetPct ?? 0) < 0);
});

test("a complete directional route exposes evidence balance, not probability", () => {
  const result = analysis();
  assert.equal(result.configurationVersion, GATED_CONFIGURATION_VERSION);
  assert.equal(result.engineVersion, GATED_ALGORITHM_VERSION);
  assert.equal(result.buySellBalance.label, "BUY BIAS");
  assert.ok((result.buySellBalance.value ?? 0) > 65);
  assert.match(result.buySellBalance.explanation, /not a calibrated probability/i);
  assert.equal(result.decision, "BUY_CHEAP_SELL_EXPENSIVE");
  assert.equal(result.eligibleForSignal, true);
});

test("rejected invalid targets remain researchable without a paper simulation", () => {
  const { buildResearchObservation } = require("../.test-dist/lib/research/snapshot.js");
  const result = analysis({ currentPrices: { bitpin: 289500, wallex: 290000, fetchedAt: nowMs } });
  const observation = buildResearchObservation({ analysis: result, detectedAt: new Date(nowMs), source: "LIVE_CRON" });
  assert.equal(observation.prediction.eligibleForSignal, false);
  assert.equal(observation.prediction.decision, "NO_TRADE_INVALID_TARGET");
  assert.equal(observation.prediction.breakEvenPrice, null);
  assert.equal(observation.algorithmVersion, GATED_ALGORITHM_VERSION);
});

test("minimum candle readiness is separate from data completeness", () => {
  const result = analysis({ bitpinCandles: candles("up", 10), wallexCandles: candles("up", 10) });
  assert.equal(result.minimumRequiredCandlePairs, 20);
  assert.equal(result.candles.synchronized, 10);
  assert.equal(result.buySellBalance.label, "INSUFFICIENT DATA");
  assert.equal(result.dataQuality.status, "INCOMPLETE");
  assert.match(result.dataQuality.reasons[0], /Only 10 of 20 required synchronized candle pairs/);
});
test("negative edge carries an independent economic rejection reason", () => {
  const result = analysis({ currentPrices: { bitpin: 289500, wallex: 290000, fetchedAt: nowMs } });
  assert.equal(result.decision, "NO_TRADE_INVALID_TARGET");
  assert.equal(result.eligibleForSignal, false);
  assert.ok((result.edge.executionNetPct ?? 0) < 0);
});
