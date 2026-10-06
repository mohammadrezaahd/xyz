const test=require("node:test");
const assert=require("node:assert/strict");
const {
  buildTestPositionDocument,
}=require("../.test-dist/lib/test-position/service.js");
const {
  classifyClosedResult,
}=require("../.test-dist/lib/test-position/calculations.js");

const CAPITAL=1_000_000;

test("position can start without an Opportunity",()=>{
  const position=buildTestPositionDocument(
    null,
    100,
    110,
    500_000,
    5,
    new Date("2026-10-06T12:00:00Z"),
  );

  assert.equal(position.direction,"LONG");
  assert.equal(position.opportunityId,null);
  assert.equal(position.opportunitySnapshot,null);
  assert.equal(position.initialCapital,500_000);
  assert.equal(position.leverage,5);
  assert.equal(position.leveragedCredit,2_500_000);
  assert.equal(position.positionNotional,3_000_000);
  assert.equal(position.usdtQuantity,30_000);
  assert.equal(position.targetPrice,110);
  assert.ok(position.liquidationPrice<position.entryPrice);
});

test("position snapshots Opportunity context while user target remains authoritative",()=>{
  const opportunity={
    _id:{toString:()=> "507f1f77bcf86cd799439011"},
    status:"OPEN",
    direction:"SHORT",
    opportunityStrength:"NONE",
    riskLevel:"VERY_HIGH",
    entry:{price:110,source:"bitpin"},
    target:{price:90,source:"phase-2-safe-target"},
    market:{bitpinPrice:110,wallexPrice:100,spreadPct:-9.09},
    analysis:{
      score:48.5,
      tests:{},
      metrics:{},
    },
    detection:{
      detectedAt:new Date("2026-10-06T10:00:00Z"),
      engineVersion:"phase-2-opportunity-engine",
    },
  };

  const position=buildTestPositionDocument(
    opportunity,
    123,
    130,
    CAPITAL,
    20,
  );

  assert.equal(position.direction,"LONG");
  assert.equal(position.opportunityId,opportunity._id);
  assert.equal(position.opportunitySnapshot.opportunityStrength,"NONE");
  assert.equal(position.opportunitySnapshot.score,48.5);
  assert.equal(position.opportunitySnapshot.riskLevel,"VERY_HIGH");
  assert.equal(position.opportunitySnapshot.suggestedEntryPrice,110);
  assert.equal(position.opportunitySnapshot.suggestedTargetPrice,90);
  assert.equal(position.targetPrice,130);
  assert.equal(position.riskSnapshot.direction,"LONG");
  assert.equal(position.riskSnapshot.opportunityStrength,"NONE");
  assert.equal(position.riskSnapshot.score,48.5);
  assert.equal(position.riskSnapshot.riskLevel,"VERY_HIGH");
});

test("LONG target cannot be below entry",()=>{
  assert.throws(
    ()=>buildTestPositionDocument(null,100,99,CAPITAL,20),
    /LONG targetPrice/,
  );
});

test("result classification follows LONG target/manual/liquidation rules",()=>{
  assert.equal(
    classifyClosedResult(100,110,110,"TARGET_REACHED"),
    "PREDICT_SUCCESS",
  );
  assert.equal(
    classifyClosedResult(100,110,105,"MANUAL_CLOSE"),
    "RELATIVELY_SUCCESSFUL",
  );
  assert.equal(
    classifyClosedResult(100,110,100,"MANUAL_CLOSE"),
    "FAILED",
  );
  assert.equal(
    classifyClosedResult(100,110,95,"LIQUIDATION"),
    "LIQUIDATED",
  );
});
