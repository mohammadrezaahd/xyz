const test=require("node:test");
const assert=require("node:assert/strict");
const {
  createPositionTerms,
  isSupportedLeverage,
  calculateGrossPnl,
  calculateExitFee,
  calculateNetPnl,
  isLiquidationConditionMet,
}=require("../.test-dist/lib/test-position/calculations.js");

const CAPITAL=1_000_000;
const ENTRY=100;

test("only 5x, 10x and 20x leverage are supported",()=>{
  assert.equal(isSupportedLeverage(5),true);
  assert.equal(isSupportedLeverage(10),true);
  assert.equal(isSupportedLeverage(20),true);
  assert.equal(isSupportedLeverage(1),false);
  assert.equal(isSupportedLeverage(25),false);
});

test("leverage exposure is capital plus leveraged credit",()=>{
  assert.deepEqual(
    [5,10,20].map((leverage)=>createPositionTerms(ENTRY,CAPITAL,leverage).positionNotional),
    [6_000_000,11_000_000,21_000_000],
  );
  assert.equal(createPositionTerms(ENTRY,CAPITAL,20).leveragedCredit,20_000_000);
});

test("USDT quantity is exposure divided by immutable entry price",()=>{
  assert.equal(createPositionTerms(100_000,CAPITAL,20).usdtQuantity,210);
});

test("LONG gross PnL moves with price",()=>{
  assert.equal(calculateGrossPnl(100,110,21_000_000),2_100_000);
  assert.equal(calculateGrossPnl(100,90,21_000_000),-2_100_000);
});

test("fees use 0.35% taker rate and actual exit notional",()=>{
  const terms=createPositionTerms(100,CAPITAL,20);
  assert.equal(Math.round(terms.entryFee),73_500);
  assert.equal(calculateExitFee(100,110,11_000_000,0.35),42_350);
});

test("final equity includes gross PnL and both transaction fees",()=>{
  const terms=createPositionTerms(100,CAPITAL,20);
  const mark=calculateNetPnl(
    100,
    110,
    terms.positionNotional,
    terms.entryFee,
    terms.exitFeePct,
    CAPITAL,
  );

  assert.equal(Math.round(mark.currentEquity),2_945_650);
  assert.equal(Math.round(mark.netPnl),1_945_650);
});

test("LONG liquidation price is below entry and entry fees alone do not liquidate",()=>{
  const terms=createPositionTerms(100,CAPITAL,20);

  assert.ok(terms.liquidationPrice<100);
  assert.equal(terms.liquidationPrice,100*(20/21));
  assert.equal(isLiquidationConditionMet(0,CAPITAL),false);
  assert.equal(isLiquidationConditionMet(-999_999,CAPITAL),false);
  assert.equal(isLiquidationConditionMet(-1_000_000,CAPITAL),true);
});
