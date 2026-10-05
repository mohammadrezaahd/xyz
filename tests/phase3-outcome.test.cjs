const test = require("node:test");
const assert = require("node:assert/strict");
const {
  evaluateSyntheticOutcome,
  calculateOpportunityStats,
} = require("../.test-dist/lib/opportunity/outcome.js");

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
