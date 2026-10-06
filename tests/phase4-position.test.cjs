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
const ENTRY_FEE = 73_500;

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

test("1M margin at 20x produces 20M leveraged credit and 21M exposure", () => {
  const terms = createPositionTerms(ENTRY, CAPITAL, LEVERAGE);
  assert.equal(terms.margin, CAPITAL);
  assert.equal(terms.leveragedCredit, 20_000_000);
  assert.equal(terms.positionNotional, NOTIONAL);
});

test("Phase 4 uses taker fees for both entry and exit", () => {
  const terms = createPositionTerms(ENTRY, CAPITAL, LEVERAGE);
  assert.equal(terms.entryFeePct, 0.35);
  assert.equal(terms.exitFeePct, 0.35);
  assert.equal(terms.entryFee, ENTRY_FEE);
});

test("SHORT gross PnL is positive when price decreases", () => {
  assert.equal(calculateGrossPnl(100, 90, NOTIONAL), 2_100_000);
});

test("SHORT gross PnL is negative when price increases", () => {
  assert.equal(calculateGrossPnl(100, 110, NOTIONAL), -2_100_000);
});

test("exit fee is 0.35% of the simulated exit notional", () => {
  assert.equal(calculateExitFee(100, 90, NOTIONAL, 0.35), 66_150);
});

test("open equity follows the authoritative equity formula", () => {
  const terms = createPositionTerms(ENTRY, CAPITAL, LEVERAGE);
  const mark = calculateNetPnl(
    ENTRY,
    90,
    NOTIONAL,
    terms.entryFee,
    terms.exitFeePct,
    CAPITAL,
  );

  assert.equal(mark.grossPnl, 2_100_000);
  assert.equal(mark.estimatedExitFee, 66_150);
  assert.equal(mark.totalFees, 139_650);
  assert.equal(mark.currentEquity, 2_960_350);
});

test("final equity equals initial capital plus gross PnL minus entry and exit fees", () => {
  const terms = createPositionTerms(ENTRY, CAPITAL, LEVERAGE);
  const mark = calculateNetPnl(
    ENTRY,
    90,
    NOTIONAL,
    terms.entryFee,
    terms.exitFeePct,
    CAPITAL,
  );

  assert.equal(
    mark.currentEquity,
    CAPITAL + mark.grossPnl - terms.entryFee - mark.estimatedExitFee,
  );
});

test("liquidation predicate compares current equity only with initial capital", () => {
  assert.equal(isLiquidationConditionMet(CAPITAL, CAPITAL), false);
  assert.equal(isLiquidationConditionMet(CAPITAL - 0.01, CAPITAL), true);
});

test("target classification is PREDICT_SUCCESS", () => {
  assert.equal(
    classifyClosedResult(100, 90, 90, "TARGET_REACHED"),
    "PREDICT_SUCCESS",
  );
});

test("manual close below entry but above target is RELATIVELY_SUCCESSFUL", () => {
  assert.equal(
    classifyClosedResult(100, 90, 95, "MANUAL_CLOSE"),
    "RELATIVELY_SUCCESSFUL",
  );
});

test("manual close at or above entry is FAILED", () => {
  assert.equal(
    classifyClosedResult(100, 90, 100, "MANUAL_CLOSE"),
    "FAILED",
  );
  assert.equal(
    classifyClosedResult(100, 90, 105, "MANUAL_CLOSE"),
    "FAILED",
  );
});

test("liquidation result is never FAILED", () => {
  assert.equal(
    classifyClosedResult(100, 90, 105, "LIQUIDATION"),
    "LIQUIDATED",
  );
});

test("position snapshot stores live entry, immutable target, margin, exposure and fees", () => {
  const document = buildTestPositionDocument(
    opportunityFixture(),
    123.456789,
    CAPITAL,
    LEVERAGE,
    new Date("2026-10-06T12:00:00Z"),
  );

  assert.equal(document.entryPrice, 123.456789);
  assert.equal(document.targetPrice, 90);
  assert.equal(document.initialCapital, CAPITAL);
  assert.equal(document.margin, CAPITAL);
  assert.equal(document.leverage, LEVERAGE);
  assert.equal(document.leveragedCredit, 20_000_000);
  assert.equal(document.positionNotional, NOTIONAL);
  assert.equal(document.entryFee, ENTRY_FEE);
  assert.equal(document.currentEquity, CAPITAL - ENTRY_FEE);
  assert.equal(document.predictionSnapshot.target.price, 90);
  assert.equal(document.predictionSnapshot.opportunityStrength, "STRONG");
});

test("literal rules expose an internal liquidation inconsistency instead of inventing an exchange rule", () => {
  const terms = createPositionTerms(ENTRY, CAPITAL, LEVERAGE);
  const atEntry = calculateNetPnl(
    ENTRY,
    ENTRY,
    NOTIONAL,
    terms.entryFee,
    terms.exitFeePct,
    CAPITAL,
  );

  assert.equal(atEntry.currentEquity, 853_000);
  assert.ok(terms.liquidationPrice < ENTRY);
  assert.equal(isLiquidationConditionMet(atEntry.currentEquity, CAPITAL), true);
});

const mongoEnabled = Boolean(
  process.env.MONGODB_URI && process.env.MONGODB_DB_NAME,
);

test(
  "Mongo persistence keeps positions and atomic OPEN closure allows exactly one winner",
  {
    skip: !mongoEnabled
      ? "Set MONGODB_URI and MONGODB_DB_NAME to run MongoDB integration tests."
      : false,
  },
  async () => {
    const { ObjectId } = require("mongodb");
    const { getMongoDb, closeMongoClient } = require("../.test-dist/lib/mongodb.js");
    const {
      insertTestPosition,
      findTestPositionById,
      closeOpenTestPosition,
    } = require("../.test-dist/lib/test-position/repository.js");

    const db = await getMongoDb();
    const collection = db.collection("testPositions");
    const now = new Date();
    const id = new ObjectId();

    const document = {
      opportunityId: new ObjectId(),
      status: "OPEN",
      result: null,
      direction: "SHORT",
      initialCapital: CAPITAL,
      margin: CAPITAL,
      leverage: LEVERAGE,
      leveragedCredit: 20_000_000,
      positionNotional: NOTIONAL,
      entryPrice: 100,
      targetPrice: 90,
      liquidationPrice: 99,
      entryFeePct: 0.35,
      exitFeePct: 0.35,
      entryFee: ENTRY_FEE,
      exitFee: null,
      totalFees: ENTRY_FEE,
      grossPnl: 0,
      netPnl: -ENTRY_FEE,
      currentPrice: 100,
      currentEquity: 926_500,
      exitPrice: null,
      exitReason: null,
      entryAt: now,
      closedAt: null,
      opportunityStrength: "STRONG",
      predictionSnapshot: {
        opportunityId: new ObjectId(),
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
      monitoring: {
        lastCheckedAt: now,
        lastError: null,
      },
      createdAt: now,
      updatedAt: now,
      _id: id,
    };

    try {
      await collection.deleteMany({ "predictionSnapshot.detection.engineVersion": "phase4-test" });
      const inserted = await insertTestPosition(document);
      assert.equal((await findTestPositionById(inserted._id)).status, "OPEN");

      const closeArgs = {
        exitPrice: 95,
        status: "CLOSED",
        result: "RELATIVELY_SUCCESSFUL",
        exitReason: "MANUAL_CLOSE",
        mark: {
          grossPnl: 1_050_000,
          exitFee: 69_825,
          totalFees: 143_325,
          netPnl: 906_675,
          finalEquity: 1_906_675,
        },
        closedAt: new Date(now.getTime() + 1000),
      };

      const [first, second] = await Promise.all([
        closeOpenTestPosition(inserted._id, closeArgs.exitPrice, closeArgs.status, closeArgs.result, closeArgs.exitReason, closeArgs.mark, closeArgs.closedAt),
        closeOpenTestPosition(inserted._id, closeArgs.exitPrice, closeArgs.status, closeArgs.result, closeArgs.exitReason, closeArgs.mark, closeArgs.closedAt),
      ]);

      assert.equal([first, second].filter(Boolean).length, 1);
      assert.equal((await findTestPositionById(inserted._id)).status, "CLOSED");
    } finally {
      await collection.deleteOne({ _id: id });
      await closeMongoClient();
    }
  },
);
