const test=require("node:test");
const assert=require("node:assert/strict");
const {buildTestPositionDocument}=require("../.test-dist/lib/test-position/service.js");
const {classifyClosedResult}=require("../.test-dist/lib/test-position/calculations.js");
const CAPITAL=1_000_000;

test("position can start without an Opportunity",()=>{
  const p=buildTestPositionDocument(null,100,90,500_000,5,new Date("2026-10-06T12:00:00Z"));
  assert.equal(p.opportunityId,null);assert.equal(p.opportunitySnapshot,null);assert.equal(p.initialCapital,500_000);assert.equal(p.leverage,5);assert.equal(p.leveragedCredit,2_500_000);assert.equal(p.positionNotional,3_000_000);assert.equal(p.usdtQuantity,30_000);assert.equal(p.targetPrice,90);
});
test("position stores Opportunity context only when supplied and user target wins",()=>{
  const opportunity={_id:{toString:()=> "507f1f77bcf86cd799439011"},status:"OPEN",direction:"SHORT",opportunityStrength:"STRONG",entry:{price:110,source:"bitpin"},target:{price:90,source:"phase-2-safe-target"},market:{bitpinPrice:110,wallexPrice:100,spreadPct:-9.09},analysis:{score:88,tests:{},metrics:{}},detection:{detectedAt:new Date("2026-10-06T10:00:00Z"),engineVersion:"phase-2-opportunity-engine"}};
  const p=buildTestPositionDocument(opportunity,123,95,CAPITAL,20);
  assert.equal(p.opportunityId,opportunity._id);assert.equal(p.opportunitySnapshot.suggestedEntryPrice,110);assert.equal(p.opportunitySnapshot.suggestedTargetPrice,90);assert.equal(p.targetPrice,95);
});
test("result classification follows target/manual/liquidation rules",()=>{
  assert.equal(classifyClosedResult(100,90,90,"TARGET_REACHED"),"PREDICT_SUCCESS");assert.equal(classifyClosedResult(100,90,95,"MANUAL_CLOSE"),"RELATIVELY_SUCCESSFUL");assert.equal(classifyClosedResult(100,90,100,"MANUAL_CLOSE"),"FAILED");assert.equal(classifyClosedResult(100,90,105,"LIQUIDATION"),"LIQUIDATED");
});
