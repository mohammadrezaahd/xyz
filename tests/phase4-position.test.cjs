const test=require("node:test");
const assert=require("node:assert/strict");
const {createPositionTerms,isSupportedLeverage,calculateGrossPnl,calculateExitFee,calculateNetPnl,isLiquidationConditionMet,classifyClosedResult}=require("../.test-dist/lib/test-position/calculations.js");
const {buildTestPositionDocument}=require("../.test-dist/lib/test-position/service.js");

const CAPITAL=1_000_000,ENTRY=100;

test("only 5x, 10x and 20x leverage are supported",()=>{
  assert.equal(isSupportedLeverage(5),true);assert.equal(isSupportedLeverage(10),true);assert.equal(isSupportedLeverage(20),true);assert.equal(isSupportedLeverage(1),false);assert.equal(isSupportedLeverage(25),false);
});
test("leverage exposure is capital plus leveraged credit",()=>{
  assert.deepEqual([5,10,20].map(l=>createPositionTerms(ENTRY,CAPITAL,l).positionNotional),[6_000_000,11_000_000,21_000_000]);
  assert.equal(createPositionTerms(ENTRY,CAPITAL,20).leveragedCredit,20_000_000);
});
test("USDT quantity is exposure divided by immutable entry price",()=>assert.equal(createPositionTerms(100_000,CAPITAL,20).usdtQuantity,210));
test("SHORT gross PnL moves opposite to price",()=>{
  assert.equal(calculateGrossPnl(100,90,21_000_000),2_100_000);assert.equal(calculateGrossPnl(100,110,21_000_000),-2_100_000);
});
test("fees use 0.35% taker rate and actual exit notional",()=>{
  const t=createPositionTerms(100,CAPITAL,20);assert.equal(t.entryFee,73_500);assert.equal(calculateExitFee(100,90,21_000_000,0.35),66_150);
});
test("final equity includes gross PnL and both transaction fees",()=>{
  const t=createPositionTerms(100,CAPITAL,20);const mark=calculateNetPnl(100,90,t.positionNotional,t.entryFee,t.exitFeePct,CAPITAL);
  assert.equal(mark.currentEquity,2_960_350);assert.equal(mark.netPnl,1_960_350);
});
test("liquidation price is above entry and entry fees alone do not liquidate",()=>{
  const t=createPositionTerms(100,CAPITAL,20);assert.ok(t.liquidationPrice>100);assert.equal(isLiquidationConditionMet(0,CAPITAL),false);assert.equal(isLiquidationConditionMet(-999_999,CAPITAL),false);assert.equal(isLiquidationConditionMet(-1_000_000,CAPITAL),true);assert.ok(t.liquidationPrice<105);
});
test("position can start without an Opportunity",()=>{
  const p=buildTestPositionDocument(null,100,90,500_000,5,new Date("2026-10-06T12:00:00Z"));
  assert.equal(p.opportunityId,null);assert.equal(p.opportunitySnapshot,null);assert.equal(p.initialCapital,500_000);assert.equal(p.leverage,5);assert.equal(p.leveragedCredit,2_500_000);assert.equal(p.positionNotional,3_000_000);assert.equal(p.usdtQuantity,30_000);assert.equal(p.targetPrice,90);
});
test("position stores Opportunity context only when supplied and user target wins",()=>{
  const opportunity={_id:{toString:()=>"507f1f77bcf86cd799439011"},status:"OPEN",direction:"SHORT",opportunityStrength:"STRONG",entry:{price:110,source:"bitpin"},target:{price:90,source:"phase-2-safe-target"},market:{bitpinPrice:110,wallexPrice:100,spreadPct:-9.09},analysis:{score:88,tests:{},metrics:{}},detection:{detectedAt:new Date("2026-10-06T10:00:00Z"),engineVersion:"phase-2-opportunity-engine"}};
  const p=buildTestPositionDocument(opportunity,123,95,CAPITAL,20);
  assert.equal(p.opportunityId,opportunity._id);assert.equal(p.opportunitySnapshot.suggestedEntryPrice,110);assert.equal(p.opportunitySnapshot.suggestedTargetPrice,90);assert.equal(p.targetPrice,95);
});
test("result classification follows target/manual/liquidation rules",()=>{
  assert.equal(classifyClosedResult(100,90,90,"TARGET_REACHED"),"PREDICT_SUCCESS");assert.equal(classifyClosedResult(100,90,95,"MANUAL_CLOSE"),"RELATIVELY_SUCCESSFUL");assert.equal(classifyClosedResult(100,90,100,"MANUAL_CLOSE"),"FAILED");assert.equal(classifyClosedResult(100,90,105,"LIQUIDATION"),"LIQUIDATED");
});
