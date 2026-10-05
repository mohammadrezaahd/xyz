const test = require("node:test");
const assert = require("node:assert/strict");
const {
  evaluateSyntheticOutcome,
  calculateOpportunityStats,
} = require("../.test-dist/lib/opportunity/outcome.js");
const { buildOpportunityDocument } = require("../.test-dist/lib/opportunity/snapshot.js");

test("valid opportunity starts as an OPEN synthetic position", () => {
  assert.equal(evaluateSyntheticOutcome(272800, 272900, "SHORT").status, "OPEN");
});

test("repeated evaluation does not change an OPEN position while price is above entry", () => {
  assert.equal(evaluateSyntheticOutcome(272800, 272801, "SHORT").status, "OPEN");
  assert.equal(evaluateSyntheticOutcome(272800, 272900, "SHORT").status, "OPEN");
});

test("position becomes SUCCESS when current price is at or below entry", () => {
  assert.equal(evaluateSyntheticOutcome(272800, 272800, "SHORT").status, "SUCCESS");
  assert.equal(evaluateSyntheticOutcome(272800, 272500, "SHORT").status, "SUCCESS");
});

test("successful position stores exit price and price change", () => {
  const outcome = evaluateSyntheticOutcome(272800, 272500, "SHORT");
  assert.equal(outcome.exitPrice, 272500);
  assert.equal(outcome.priceChangePct, ((272500 - 272800) / 272800) * 100);
});

test("OPEN positions are not counted as failures", () => {
  const stats = calculateOpportunityStats(["OPEN", "SUCCESS", "FAILED"]);
  assert.equal(stats.open, 1);
  assert.equal(stats.failed, 1);
  assert.equal(stats.successRate, 50);
});

test("success rate excludes OPEN and INVALIDATED positions", () => {
  const stats = calculateOpportunityStats([
    "OPEN",
    "INVALIDATED",
    "SUCCESS",
    "SUCCESS",
    "FAILED",
  ]);
  assert.equal(stats.successRate, (2 / 3) * 100);
});

test("missing or invalid current price does not create false SUCCESS or FAILED", () => {
  assert.equal(evaluateSyntheticOutcome(272800, null, "SHORT").status, "OPEN");
  assert.equal(evaluateSyntheticOutcome(272800, Number.NaN, "SHORT").status, "OPEN");
  assert.equal(
    evaluateSyntheticOutcome(272800, Number.POSITIVE_INFINITY, "SHORT").status,
    "OPEN",
  );
});

test("structurally invalid entry becomes INVALIDATED", () => {
  assert.equal(evaluateSyntheticOutcome(0, 272500, "SHORT").status, "INVALIDATED");
});

test("valid Phase 2 analysis snapshot creates one OPEN SHORT position", () => {
  const analysis = {
    prices: { bitpin: 269000, wallex: 272800, external: null },
    spread: { absolute: 3800, percent: 1.412 },
    validation: {
      external: { status: "INSUFFICIENT_DATA", actual: null, threshold: 0.4 },
      wallexAboveBitpin: { status: "SUCCESS", actual: 3800, threshold: 0 },
      spread: { status: "SUCCESS", actual: 1.412, threshold: 1 },
      candleAlignment: { status: "SUCCESS", actual: 0.9, threshold: 0.8 },
      bitpinBullish: { status: "SUCCESS", actual: 0.9, threshold: 0.8 },
      wallexBullish: { status: "SUCCESS", actual: 0.9, threshold: 0.8 },
      targetViability: { status: "SUCCESS", actual: 0.4, threshold: 0 },
    },
    candles: {
      lookback: 20,
      synchronized: 20,
      bitpinBullishRatio: 0.9,
      wallexBullishRatio: 0.9,
      alignmentRatio: 0.9,
      averageDirectionalMovePct: 0.1,
      momentumScore: 2.5,
    },
    target: {
      entryPrice: 269000,
      safeTarget: 272000,
      safetyMarginPct: 0.3,
      horizonMinutes: 30,
    },
    edge: { gross: 3000, grossPct: 1.1, feesPct: 0.2, netPct: 0.9 },
    stabilityScore: 82,
    dataCompleteness: 0.9,
    riskLevel: "LOW",
    opportunity: "STRONG",
  };

  const document = buildOpportunityDocument(analysis, new Date("2026-10-05T20:00:00Z"));
  assert.equal(document.status, "OPEN");
  assert.equal(document.direction, "SHORT");
  assert.equal(document.entry.price, 272800);
  assert.equal(document.entry.source, "wallex");
  assert.equal(document.outcome.status, "PENDING");
});
