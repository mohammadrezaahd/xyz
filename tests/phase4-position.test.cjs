const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createPositionTerms,
  calculateGrossPnl,
  calculateExitFee,
  calculateNetPnl,
  isLiquidationConditionMet,
  classifyClosedResult,
} = require("../.test-dist/lib/test-position/calculations.js");
const { buildTestPositionDocument } = require("../.test-dist/lib/test-position/service.js");

const ENTRY = 100;
const CAPITAL = 1_000_000;
const LEVERAGE = 20;
const NOTIONAL = 21_000_000;

function opportunityFixture() {
  return {
    _id: { toString: () => "507f1f77bcf86cd799439011" },
    createdAt: new Date("2026-10-06T10:00:00Z"),
    updatedAt: new Date("2026-10-06T10:00:00Z"),
    status: "OPEN",
    direction: "SHORT",
    opportunityStrength: "STRONG",
    entry: { price: 110, source: "bitpin" },
    target: { price: 90, source: "phase-2-safe-target" },
    market: { bitpinPrice: 110, wallexPrice: 100, spreadPct: -9.09 },
    analysis: {
      score: 88,
      tests: {
        externalValidation: { status: "SUCCESS", actual: 0.1, threshold: 0.4 },
        wallexAboveBitpin: { status: "FAILED", actual: -10, threshold: 0 },
        spreadThreshold: { status: "SUCCESS", actual: 1.2, threshold: 1 },
        bitpinBullishRatio: { status: "SUCCESS", actual: 0.9, threshold: 0.8 },
        wallexBullishRatio: { status: "SUCCESS", actual: 0.9, threshold: 0.8 },
        candleAlignment: { status: "SUCCESS", actual: 0.9, threshold: 0.8 },
        targetViability: { status: "SUCCESS", actual: 0.5, threshold: 0 },
      },
      metrics: {
        bitpinBullishPct: 90,
        wallexBullishPct: 90,
        candleAlignmentPct: 90,
        averageDirectionalMovePct: 0.1,
        momentumScore: 2.5,
      },
    },
    outcome: {
      status: "PENDING",
      resolvedAt: null,
      exitPrice: null,
      priceChangePct: null,
    },
    detection: {
      detectedAt: new Date("2026-10-06T10:00:00Z"),
      engineVersion: "phase-2-opportunity-engine",
    },
    monitoring: {
      currentBitpinPrice: 110,
      updatedAt: new Date("2026-10-06T10:00:00Z"),
    },
  };
}

test("1M capital at 20x produces 20M leveraged credit and 21M notional", () => {
  const terms = createPositionTerms(ENTRY, CAPITAL, LEVERAGE);
  assert.equal(terms.leveragedCredit, 20_000_000);
  assert.equal(terms.positionNotional, NOTIONAL);
});

test("SHORT profits when current price is below entry", () => {
  assert.equal(calculateGrossPnl(100, 90, NOTIONAL), 2_100_000);
});

test("SHORT loses when current price is above entry", () => {
  assert.equal(calculateGrossPnl(100, 110, NOTIONAL), -2_100_000);
});

test("entry fee is exactly 0.35% of position notional", () => {
  const terms = createPositionTerms(ENTRY, CAPITAL, LEVERAGE);
  assert.equal(terms.entryFee, 73_500);
  assert.equal(terms.entryFeePct, 0.35);
});

test("exit fee is exactly 0.35% of simulated exit notional", () => {
  assert.equal(calculateExitFee(100, 90, NOTIONAL, 0.35), 66_150);
});

test("net PnL includes both entry and estimated exit fees", () => {
  const terms = createPositionTerms(ENTRY, CAPITAL, LEVERAGE);
  const pnl = calculateNetPnl(ENTRY, 90, NOTIONAL, terms.entryFee, terms.exitFeePct);
  assert.equal(pnl.grossPnl, 2_100_000);
  assert.equal(pnl.totalFees, 139_650);
  assert.equal(pnl.netPnl, 1_960_350);
});

test("target reached is classified as PREDICT_SUCCESS", () => {
  assert.equal(classifyClosedResult(100, 90, 90, "TARGET_REACHED"), "PREDICT_SUCCESS");
  assert.equal(classifyClosedResult(100, 90, 89, "MANUAL_CLOSE"), "PREDICT_SUCCESS");
});

test("manual close below entry but above target is RELATIVELY_SUCCESSFUL", () => {
  assert.equal(classifyClosedResult(100, 90, 95, "MANUAL_CLOSE"), "RELATIVELY_SUCCESSFUL");
});

test("manual close at or above entry is FAILED when not liquidated", () => {
  assert.equal(classifyClosedResult(100, 90, 100, "MANUAL_CLOSE"), "FAILED");
  assert.equal(classifyClosedResult(100, 90, 105, "MANUAL_CLOSE"), "FAILED");
});

test("liquidation condition uses the custom initial-position-value rule", () => {
  const terms = createPositionTerms(ENTRY, CAPITAL, LEVERAGE);
  assert.equal(
    isLiquidationConditionMet(
      ENTRY,
      100.01,
      NOTIONAL,
      terms.entryFee,
      terms.exitFeePct,
    ),
    true,
  );
  assert.equal(
    isLiquidationConditionMet(
      ENTRY,
      99.99,
      NOTIONAL,
      terms.entryFee,
      terms.exitFeePct,
    ),
    false,
  );
});

test("liquidation result is never FAILED", () => {
  assert.equal(classifyClosedResult(100, 90, 101, "LIQUIDATION"), "LIQUIDATED");
});

test("target and Phase 2 prediction snapshot are copied immutably at creation", () => {
  const document = buildTestPositionDocument(
    opportunityFixture(),
    105,
    CAPITAL,
    LEVERAGE,
    new Date("2026-10-06T12:00:00Z"),
  );

  assert.equal(document.targetPrice, 90);
  assert.equal(document.predictionSnapshot.target.price, 90);
  assert.equal(document.predictionSnapshot.opportunityStrength, "STRONG");
  assert.equal(document.predictionSnapshot.score, 88);
  assert.equal(document.predictionSnapshot.validation.externalValidation.status, "SUCCESS");
});

test("creation records the live entry price, capital and fee snapshots", () => {
  const document = buildTestPositionDocument(
    opportunityFixture(),
    123.456789,
    CAPITAL,
    LEVERAGE,
  );

  assert.equal(document.entryPrice, 123.456789);
  assert.equal(document.initialCapital, CAPITAL);
  assert.equal(document.leverage, LEVERAGE);
  assert.equal(document.leveragedCredit, 20_000_000);
  assert.equal(document.positionNotional, NOTIONAL);
  assert.equal(document.entryFeePct, 0.35);
  assert.equal(document.exitFeePct, 0.35);
});

const mongoEnabled = Boolean(process.env.MONGODB_URI && process.env.MONGODB_DB_NAME);

test(
  "MongoDB persistence survives repository reads and simultaneous close only succeeds once",
  { skip: !mongoEnabled ? "Set MONGODB_URI and MONGODB_DB_NAME to run MongoDB integration tests." : false },
  async () => {
    const { getMongoDb, closeMongoClient } = require("../.test-dist/lib/mongodb.js");
    const {
      insertTestPosition,
      findTestPositionById,
      closeOpenTestPosition,
    } = require("../.test-dist/lib/test-position/repository.js");

    const db = await getMongoDb();
    const collection = db.collection("testPositions");
    const now = new Date();
    const opportunityId = new (require("mongodb").ObjectId)();

    const document = {
      opportunityId,
      status: "OPEN",
      result: null,
      direction: "SHORT",
      entryPrice: 100,
      targetPrice: 90,
      liquidationPrice: 100,
      exitPrice: null,
      initialCapital: CAPITAL,
      leverage: LEVERAGE,
      leveragedCredit: 20_000_000,
      positionNotional: NOTIONAL,
      entryFeePct: 0.35,
      exitFeePct: 0.35,
      entryFee: 73_500,
      exitFee: null,
      totalFees: 73_500,
      grossPnl: 0,
      netPnl: -73_500,
      opportunityStrength: "STRONG",
      predictionSnapshot: {
        opportunityStrength: "STRONG",
        direction: "SHORT",
        score: 88,
        entry: { price: 110, source: "bitpin" },
        target: { price: 90, source: "phase-2-safe-target" },
        market: { bitpinPrice: 110, wallexPrice: 100, spreadPct: -9.09 },
        validation: {},
        metrics: {
          bitpinBullishPct: 90,
          wallexBullishPct: 90,
          candleAlignmentPct: 90,
          averageDirectionalMovePct: 0.1,
          momentumScore: 2.5,
        },
        detection: {
          detectedAt: now,
          engineVersion: "phase4-test",
        },
      },
      entryAt: now,
      closedAt: null,
      exitReason: null,
      monitoring: {
        currentBitpinPrice: 100,
        lastCheckedAt: now,
        lastError: null,
      },
      createdAt: now,
      updatedAt: now,
    };

    try {
      await collection.deleteMany({ "predictionSnapshot.detection.engineVersion": "phase4-test" });
      const inserted = await insertTestPosition(document);
      const persisted = await findTestPositionById(inserted._id);
      assert.equal(persisted?.status, "OPEN");

      const [first, second] = await Promise.all([
        closeOpenTestPosition(
          inserted._id,
          95,
          "RELATIVELY_SUCCESSFUL",
          "MANUAL_CLOSE",
          1_050_000,
          69_825,
          143_325,
          906_675,
          new Date(now.getTime() + 1000),
        ),
        closeOpenTestPosition(
          inserted._id,
          95,
          "RELATIVELY_SUCCESSFUL",
          "MANUAL_CLOSE",
          1_050_000,
          69_825,
          143_325,
          906_675,
          new Date(now.getTime() + 1000),
        ),
      ]);

      assert.equal([first, second].filter(Boolean).length, 1);
      const closed = await findTestPositionById(inserted._id);
      assert.equal(closed?.status, "CLOSED");
      assert.equal(closed?.result, "RELATIVELY_SUCCESSFUL");

      await collection.deleteOne({ _id: inserted._id });
    } finally {
      await closeMongoClient();
    }
  },
);

test(
  "automatic target and liquidation monitoring close OPEN positions exactly once",
  { skip: !mongoEnabled ? "Set MONGODB_URI and MONGODB_DB_NAME to run MongoDB integration tests." : false },
  async () => {
    const { ObjectId } = require("mongodb");
    const { getMongoDb, closeMongoClient } = require("../.test-dist/lib/mongodb.js");
    const {
      insertTestPosition,
      findTestPositionById,
    } = require("../.test-dist/lib/test-position/repository.js");
    const { monitorOpenTestPositions } = require("../.test-dist/lib/test-position/service.js");

    const db = await getMongoDb();
    const collection = db.collection("testPositions");
    const now = new Date();
    const base = {
      status: "OPEN",
      result: null,
      direction: "SHORT",
      entryPrice: 100,
      targetPrice: 90,
      liquidationPrice: 100,
      exitPrice: null,
      initialCapital: CAPITAL,
      leverage: LEVERAGE,
      leveragedCredit: 20_000_000,
      positionNotional: NOTIONAL,
      entryFeePct: 0.35,
      exitFeePct: 0.35,
      entryFee: 73_500,
      exitFee: null,
      totalFees: 73_500,
      grossPnl: 0,
      netPnl: -73_500,
      opportunityStrength: "STRONG",
      predictionSnapshot: {
        opportunityStrength: "STRONG",
        direction: "SHORT",
        score: 88,
        entry: { price: 100, source: "bitpin" },
        target: { price: 90, source: "phase-2-safe-target" },
        market: { bitpinPrice: 100, wallexPrice: 102, spreadPct: 2 },
        validation: {},
        metrics: {
          bitpinBullishPct: 90,
          wallexBullishPct: 90,
          candleAlignmentPct: 90,
          averageDirectionalMovePct: 0.1,
          momentumScore: 2.5,
        },
        detection: {
          detectedAt: now,
          engineVersion: "phase4-monitor-test",
        },
      },
      entryAt: now,
      closedAt: null,
      exitReason: null,
      monitoring: {
        currentBitpinPrice: 100,
        lastCheckedAt: now,
        lastError: null,
      },
      createdAt: now,
      updatedAt: now,
    };

    try {
      await collection.deleteMany({ "predictionSnapshot.detection.engineVersion": "phase4-monitor-test" });

      const targetPosition = await insertTestPosition({
        ...base,
        opportunityId: new ObjectId(),
      });
      const liquidationPosition = await insertTestPosition({
        ...base,
        opportunityId: new ObjectId(),
      });

      const targetResult = await monitorOpenTestPositions(90, new Date(now.getTime() + 1000));
      assert.equal(targetResult.closed, 1);

      const liquidationResult = await monitorOpenTestPositions(100.01, new Date(now.getTime() + 2000));
      assert.equal(liquidationResult.liquidated, 1);

      const target = await findTestPositionById(targetPosition._id);
      const liquidation = await findTestPositionById(liquidationPosition._id);

      assert.equal(target?.status, "CLOSED");
      assert.equal(target?.result, "PREDICT_SUCCESS");
      assert.equal(target?.exitReason, "TARGET_REACHED");
      assert.equal(liquidation?.status, "LIQUIDATED");
      assert.equal(liquidation?.result, "LIQUIDATED");
      assert.equal(liquidation?.exitReason, "LIQUIDATION");

      const secondTargetRun = await monitorOpenTestPositions(90, new Date(now.getTime() + 3000));
      assert.equal(secondTargetRun.closed, 0);
      assert.equal(secondTargetRun.liquidated, 0);

      await collection.deleteMany({ "predictionSnapshot.detection.engineVersion": "phase4-monitor-test" });
    } finally {
      await closeMongoClient();
    }
  },
);

test(
  "missing Bitpin price leaves positions OPEN and records a monitoring error",
  { skip: !mongoEnabled ? "Set MONGODB_URI and MONGODB_DB_NAME to run MongoDB integration tests." : false },
  async () => {
    const { ObjectId } = require("mongodb");
    const { getMongoDb, closeMongoClient } = require("../.test-dist/lib/mongodb.js");
    const {
      insertTestPosition,
      findTestPositionById,
    } = require("../.test-dist/lib/test-position/repository.js");
    const { recordMonitoringFailure } = require("../.test-dist/lib/test-position/service.js");

    const db = await getMongoDb();
    const collection = db.collection("testPositions");
    const now = new Date();

    try {
      await collection.deleteMany({ "predictionSnapshot.detection.engineVersion": "phase4-missing-price-test" });

      const position = await insertTestPosition({
        ...baseMissingPriceDocument(CAPITAL, LEVERAGE, NOTIONAL, now),
        opportunityId: new ObjectId(),
      });

      await recordMonitoringFailure(new Date(now.getTime() + 1000), "Bitpin unavailable");
      const persisted = await findTestPositionById(position._id);

      assert.equal(persisted?.status, "OPEN");
      assert.equal(persisted?.monitoring.currentBitpinPrice, null);
      assert.equal(persisted?.monitoring.lastError, "Bitpin unavailable");

      await collection.deleteOne({ _id: position._id });
    } finally {
      await closeMongoClient();
    }
  },
);

function baseMissingPriceDocument(capital, leverage, notional, now) {
  return {
    status: "OPEN",
    result: null,
    direction: "SHORT",
    entryPrice: 100,
    targetPrice: 90,
    liquidationPrice: 100,
    exitPrice: null,
    initialCapital: capital,
    leverage,
    leveragedCredit: 20_000_000,
    positionNotional: notional,
    entryFeePct: 0.35,
    exitFeePct: 0.35,
    entryFee: 73_500,
    exitFee: null,
    totalFees: 73_500,
    grossPnl: 0,
    netPnl: -73_500,
    opportunityStrength: "STRONG",
    predictionSnapshot: {
      opportunityStrength: "STRONG",
      direction: "SHORT",
      score: 88,
      entry: { price: 100, source: "bitpin" },
      target: { price: 90, source: "phase-2-safe-target" },
      market: { bitpinPrice: 100, wallexPrice: 102, spreadPct: 2 },
      validation: {},
      metrics: {
        bitpinBullishPct: 90,
        wallexBullishPct: 90,
        candleAlignmentPct: 90,
        averageDirectionalMovePct: 0.1,
        momentumScore: 2.5,
      },
      detection: {
        detectedAt: now,
        engineVersion: "phase4-missing-price-test",
      },
    },
    entryAt: now,
    closedAt: null,
    exitReason: null,
    monitoring: {
      currentBitpinPrice: 100,
      lastCheckedAt: now,
      lastError: null,
    },
    createdAt: now,
    updatedAt: now,
  };
}

