const test = require("node:test");
const assert = require("node:assert/strict");
const { ObjectId } = require("mongodb");
const { analyzeOpportunity } = require("../.test-dist/lib/opportunity/engine.js");
const { buildObservationKey, buildResearchObservation } = require("../.test-dist/lib/research/snapshot.js");
const { calculateResearchMetrics } = require("../.test-dist/lib/research/metrics.js");
const { createResearchObservation, linkPaperPosition, resolveResearchObservation } = require("../.test-dist/lib/research/repository.js");
const { getMongoDb, closeMongoClient } = require("../.test-dist/lib/mongodb.js");

function analysis(now = 1_800_000_000_000) {
  return analyzeOpportunity({
    bitpinCandles: [],
    wallexCandles: [],
    currentPrices: { bitpin: 100, wallex: 102 },
    externalPrice: 102,
    nowMs: now,
  });
}
function observation(overrides = {}) {
  return buildResearchObservation({
    analysis: analysis(),
    detectedAt: new Date("2026-10-07T10:00:00.000Z"),
    fetchedAt: new Date("2026-10-07T10:00:00.000Z"),
    source: "LIVE_CRON",
    ...overrides,
  });
}

test("research snapshot preserves prediction, checks, versions, and empty actual outcome", () => {
  const item = observation();
  assert.equal(item.status, "DETECTED");
  assert.equal(item.source, "LIVE_CRON");
  assert.equal(item.engineVersion, "phase-2-opportunity-engine");
  assert.equal(item.configurationVersion, "phase-5a-live-default-v1");
  assert.equal(item.actual.resolvedAt, null);
  assert.equal(item.actual.netPnl, null);
  assert.ok(item.stabilityChecks.momentum);
  assert.equal(item.market.bitpinPrice, 100);
  assert.equal(item.market.providerAvailability.bitpin, true);
  assert.equal(item.candles.synchronizedCandleCount, 0);
  assert.equal(item.candles.bitpinBullishRatio, null);
  assert.equal(item.prediction.confidence, null);
});

test("missing market and candle values remain explicit nulls", () => {
  const item = buildResearchObservation({
    analysis: analyzeOpportunity({ bitpinCandles: [], wallexCandles: [], currentPrices: { bitpin: null, wallex: null }, externalPrice: null }),
    detectedAt: new Date("2026-10-07T10:00:00.000Z"),
    source: "LIVE_CRON",
  });
  assert.equal(item.market.bitpinPrice, null);
  assert.equal(item.market.wallexPrice, null);
  assert.equal(item.market.absoluteSpread, null);
  assert.equal(item.market.providerAvailability.bitpin, false);
  assert.equal(item.candles.momentumScore, null);
  assert.equal(item.prediction.suggestedTargetPrice, null);
  assert.equal(item.prediction.expectedNetPnl, null);
});

test("observation key is deterministic and separates detection windows", () => {
  const first = observation();
  const same = observation();
  const later = observation({ detectedAt: new Date("2026-10-07T10:01:00.000Z") });
  assert.equal(first.observationKey, same.observationKey);
  const sameWindowDifferentPrice = buildResearchObservation({
    analysis: analyzeOpportunity({ bitpinCandles: [], wallexCandles: [], currentPrices: { bitpin: 101, wallex: 103 }, externalPrice: 103 }),
    detectedAt: new Date("2026-10-07T10:00:30.000Z"),
    source: "LIVE_CRON",
  });
  assert.equal(sameWindowDifferentPrice.observationKey, first.observationKey);
  assert.notEqual(first.observationKey, later.observationKey);
});

test("metrics use resolved observations for outcome averages and target-hit rate", () => {
  const base = observation();
  const resolvedHit = { ...base, status: "RESOLVED", paperPositionId: new ObjectId(), actual: { ...base.actual, resolvedAt: new Date(), result: "PREDICT_SUCCESS", exitReason: "TARGET_REACHED", netPnl: 10, roi: 1, durationMs: 100 } };
  const resolvedManual = { ...base, status: "RESOLVED", paperPositionId: new ObjectId(), actual: { ...base.actual, resolvedAt: new Date(), result: "RELATIVELY_SUCCESSFUL", exitReason: "MANUAL_CLOSE", netPnl: 20, roi: 2, durationMs: null } };
  const unresolved = { ...base, paperPositionId: null };
  const metrics = calculateResearchMetrics([resolvedHit, resolvedManual, unresolved]);
  assert.equal(metrics.totalObservations, 3);
  assert.equal(metrics.observationsWithPaperTests, 2);
  assert.equal(metrics.observationsWithoutPaperTests, 1);
  assert.equal(metrics.resolvedObservations, 2);
  assert.equal(metrics.targetHits, 1);
  assert.equal(metrics.manualCloses, 1);
  assert.equal(metrics.winRate, 0.5);
  assert.equal(metrics.averageNetPnl, 15);
  assert.equal(metrics.averageDurationMs, 100);
});

test("duplicate research keys are handled idempotently when MongoDB is configured", { skip: !process.env.MONGODB_URI || !process.env.MONGODB_DB_NAME }, async () => {
  const first = observation();
  const second = observation();
  const a = await createResearchObservation(first);
  const b = await createResearchObservation(second);
  assert.equal(a.created, true);
  assert.equal(b.created, false);
  assert.equal(a.observation._id.toString(), b.observation._id.toString());
  const paperPositionId = new ObjectId();
  assert.equal(await linkPaperPosition(a.observation._id, paperPositionId, new Date()), "linked");
  assert.equal(await linkPaperPosition(a.observation._id, paperPositionId, new Date()), "already-linked");
  assert.equal(await resolveResearchObservation(paperPositionId, {
    entryPrice: 100,
    exitPrice: 102,
    targetPrice: 102,
    liquidationPrice: 90,
    result: "PREDICT_SUCCESS",
    exitReason: "TARGET_REACHED",
    grossPnl: 20,
    totalFees: 2,
    netPnl: 18,
    roi: 1.8,
    durationMs: 60_000,
    resolvedAt: new Date(),
  }, new Date()), "resolved");
  assert.equal(await resolveResearchObservation(paperPositionId, {
    entryPrice: 100,
    exitPrice: 90,
    targetPrice: 102,
    liquidationPrice: 90,
    result: "LIQUIDATED",
    exitReason: "LIQUIDATION",
    grossPnl: -100,
    totalFees: 2,
    netPnl: -102,
    roi: -10.2,
    durationMs: 120_000,
    resolvedAt: new Date(),
  }, new Date()), "already-resolved");
  const db = await getMongoDb();
  await db.collection("researchObservations").deleteOne({ _id: a.observation._id });
  await closeMongoClient();
});
