const test=require("node:test");
const assert=require("node:assert/strict");
const {createPositionTerms,isSupportedLeverage,calculateGrossPnl,calculateExitFee,calculateNetPnl,isLiquidationConditionMet}=require("../.test-dist/lib/test-position/calculations.js");
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
