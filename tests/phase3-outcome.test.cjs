const test = require("node:test");
const assert = require("node:assert/strict");
const {
  evaluateSyntheticOutcome,
  calculateOpportunityStats,
} = require("../.test-dist/lib/opportunity/outcome.js");
const { buildOpportunityDocument } = require("../.test-dist/lib/opportunity/snapshot.js");
const { isCronAuthorized } = require("../.test-dist/lib/opportunity/cron-auth.js");
const {
  createPositionSimulation,
  calculateBreakEvenPrice,
  calculateLiquidationPrice,
  calculateLeveragedPnl,
} = require("../.test-dist/lib/opportunity/position.js");

const ENTRY = 269000;
const TARGET = 272000;

test("current Bitpin at or above target resolves SUCCESS", () => {
  assert.equal(evaluateSyntheticOutcome(ENTRY, TARGET, 272001, "SHORT").status, "SUCCESS");
  assert.equal(evaluateSyntheticOutcome(ENTRY, TARGET, TARGET, "SHORT").status, "SUCCESS");
});

test("small move below entry remains OPEN", () => {
  assert.equal(evaluateSyntheticOutcome(ENTRY, TARGET, 268999, "LONG").status, "OPEN");
});

test("liquidation threshold resolves FAILED", () => {
  const simulation = createPositionSimulation(ENTRY, TARGET);
  const evaluation = evaluateSyntheticOutcome(
    ENTRY,
    TARGET,
    simulation.liquidationPrice - 1,
    "LONG",
    simulation,
  );
  assert.equal(evaluation.status, "FAILED");
  assert.equal(evaluation.exitPrice, simulation.liquidationPrice);
});

test("current Bitpin between entry and target remains OPEN", () => {
  assert.equal(evaluateSyntheticOutcome(ENTRY, TARGET, 270000, "SHORT").status, "OPEN");
});

test("exact entry price does not count as FAILED", () => {
  assert.equal(evaluateSyntheticOutcome(ENTRY, TARGET, ENTRY, "SHORT").status, "OPEN");
});

test("successful position uses fee-aware target and stores leveraged PnL", () => {
  const simulation = createPositionSimulation(ENTRY, TARGET);
  const outcome = evaluateSyntheticOutcome(
    ENTRY,
    TARGET,
    simulation.targetPrice,
    "LONG",
    simulation,
  );
  assert.equal(outcome.exitPrice, simulation.targetPrice);
  assert.equal(outcome.netPnlToman !== null, true);
  assert.equal(outcome.totalFeesToman !== null, true);
});

test("manual close PnL includes both entry and exit taker fees", () => {
  const simulation = createPositionSimulation(ENTRY, TARGET);
  const pnl = calculateLeveragedPnl(ENTRY, ENTRY, simulation);
  assert.equal(pnl.grossPnlToman, 0);
  assert.equal(
    pnl.totalFeesToman,
    simulation.entryFeeToman + simulation.quantity * ENTRY * 0.0035,
  );
  assert.equal(pnl.netPnlToman < 0, true);
});

test("invalid entry is INVALIDATED", () => {
  assert.equal(evaluateSyntheticOutcome(0, TARGET, 270000, "SHORT").status, "INVALIDATED");
  assert.equal(evaluateSyntheticOutcome(Number.NaN, TARGET, 270000, "SHORT").status, "INVALIDATED");
});

test("invalid target is INVALIDATED", () => {
  assert.equal(evaluateSyntheticOutcome(ENTRY, 0, 270000, "SHORT").status, "INVALIDATED");
  assert.equal(evaluateSyntheticOutcome(ENTRY, Number.POSITIVE_INFINITY, 270000, "SHORT").status, "INVALIDATED");
});

test("missing or invalid current price remains OPEN", () => {
  assert.equal(evaluateSyntheticOutcome(ENTRY, TARGET, null, "SHORT").status, "OPEN");
  assert.equal(evaluateSyntheticOutcome(ENTRY, TARGET, Number.NaN, "SHORT").status, "OPEN");
  assert.equal(evaluateSyntheticOutcome(ENTRY, TARGET, Number.POSITIVE_INFINITY, "SHORT").status, "OPEN");
});

test("success rate excludes OPEN and INVALIDATED and uses successful/(successful+failed)", () => {
  const stats = calculateOpportunityStats([
    "OPEN",
    "INVALIDATED",
    "CLOSED",
    "SUCCESS",
    "SUCCESS",
    "FAILED",
  ]);
  assert.equal(stats.resolved, 3);
  assert.equal(stats.successRate, 2 / 3);
});

test("success rate is null when there are no resolved opportunities", () => {
  const stats = calculateOpportunityStats(["OPEN", "INVALIDATED", "CLOSED"]);
  assert.equal(stats.resolved, 0);
  assert.equal(stats.successRate, null);
});

test("valid Phase 2 analysis snapshot uses Bitpin entry and exact Safe Target", () => {
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
  assert.equal(document.direction, "LONG");
  assert.equal(document.entry.price, 269000);
  assert.equal(document.entry.source, "bitpin");
  assert.equal(document.target.price, 272000);
  assert.equal(document.target.source, "phase-2-safe-target");
  assert.equal(document.simulation.marginToman, 1000000);
  assert.equal(document.simulation.borrowedToman, 10000000);
  assert.equal(document.simulation.notionalToman, 11000000);
  assert.equal(document.simulation.leverage, 10);
  assert.equal(document.simulation.effectiveLeverage, 11);
  assert.equal(document.simulation.takerFeePct, 0.35);
  assert.equal(document.simulation.maintenanceMarginPct, 0.5);
  assert.equal(document.simulation.targetPrice >= document.simulation.breakEvenPrice, true);
  assert.equal(document.simulation.liquidationPrice < document.entry.price, true);
  assert.equal(document.market.bitpinPrice, 269000);
  assert.equal(document.market.wallexPrice, 272800);
  assert.equal(document.monitoring.currentBitpinPrice, 269000);
  assert.equal(document.outcome.status, "PENDING");
});

test("break-even price covers both taker fees", () => {
  const breakEven = calculateBreakEvenPrice(ENTRY);
  assert.equal(breakEven > ENTRY, true);
  const simulation = createPositionSimulation(ENTRY, TARGET);
  const pnl = calculateLeveragedPnl(ENTRY, breakEven, simulation);
  assert.ok(Math.abs(pnl.netPnlToman) < 1);
});

test("cron endpoint authorization accepts only the configured bearer secret", () => {
  assert.equal(isCronAuthorized("Bearer phase3-secret", "phase3-secret"), true);
  assert.equal(isCronAuthorized("Bearer wrong", "phase3-secret"), false);
  assert.equal(isCronAuthorized(null, "phase3-secret"), false);
  assert.equal(isCronAuthorized("Bearer phase3-secret", undefined), false);
});
