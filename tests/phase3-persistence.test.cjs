const test = require("node:test");
const assert = require("node:assert/strict");

const enabled = Boolean(process.env.MONGODB_URI && process.env.MONGODB_DB_NAME);

test(
  "MongoDB persistence survives separate repository calls and enforces one OPEN position",
  { skip: !enabled ? "Set MONGODB_URI and MONGODB_DB_NAME to run the MongoDB integration test." : false },
  async () => {
    const { getMongoDb, closeMongoClient } = require("../.test-dist/lib/mongodb.js");
    const {
      findOpenOpportunity,
      insertOpenOpportunity,
      resolveOpportunity,
    } = require("../.test-dist/lib/opportunities/repository.js");

    const db = await getMongoDb();
    const collection = db.collection("opportunities");

    try {
      await collection.deleteMany({ "detection.engineVersion": "phase3-test" });

      const now = new Date();
    const first = {
      createdAt: now,
      updatedAt: now,
      status: "OPEN",
      direction: "SHORT",
      entry: { price: 272800, source: "wallex" },
      market: { bitpinPrice: 269000, wallexPrice: 272800, spreadPct: 1.412 },
      analysis: {
        score: 80,
        tests: {
          externalValidation: { status: "SUCCESS", actual: 0.1, threshold: 0.4 },
          wallexAboveBitpin: { status: "SUCCESS", actual: 3800, threshold: 0 },
          spreadThreshold: { status: "SUCCESS", actual: 1.412, threshold: 1 },
          bitpinBullishRatio: { status: "SUCCESS", actual: 0.9, threshold: 0.8 },
          wallexBullishRatio: { status: "SUCCESS", actual: 0.9, threshold: 0.8 },
          candleAlignment: { status: "SUCCESS", actual: 0.9, threshold: 0.8 },
          targetViability: { status: "SUCCESS", actual: 1, threshold: 0 },
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
      detection: { detectedAt: now, engineVersion: "phase3-test" },
      monitoring: { currentWallexPrice: 272800, updatedAt: now },
    };

    const inserted = await insertOpenOpportunity(first);
    const fromSecondCall = await findOpenOpportunity();
    const duplicate = await insertOpenOpportunity({
      ...first,
      _id: undefined,
      createdAt: new Date(now.getTime() + 1000),
      updatedAt: new Date(now.getTime() + 1000),
    });

    assert.ok(inserted._id);
    assert.equal(fromSecondCall?._id?.toString(), inserted._id.toString());
    assert.equal(duplicate._id?.toString(), inserted._id.toString());

    await resolveOpportunity(
      inserted._id,
      272500,
      ((272500 - 272800) / 272800) * 100,
      new Date(now.getTime() + 2000),
      "SUCCESS",
    );

    const resolved = await collection.findOne({ _id: inserted._id });
    assert.equal(resolved?.status, "SUCCESS");
    assert.equal(resolved?.outcome.exitPrice, 272500);
    assert.equal(resolved?.outcome.status, "SUCCESS");

    const later = await insertOpenOpportunity({
      ...first,
      _id: undefined,
      createdAt: new Date(now.getTime() + 3000),
      updatedAt: new Date(now.getTime() + 3000),
      entry: { price: 273000, source: "wallex" },
      market: { bitpinPrice: 269000, wallexPrice: 273000, spreadPct: 1.48 },
      monitoring: { currentWallexPrice: 273000, updatedAt: new Date(now.getTime() + 3000) },
    });
    assert.ok(later._id);
    assert.notEqual(later._id.toString(), inserted._id.toString());

      await collection.deleteMany({ "detection.engineVersion": "phase3-test" });
    } finally {
      await closeMongoClient();
    }
  },
);
