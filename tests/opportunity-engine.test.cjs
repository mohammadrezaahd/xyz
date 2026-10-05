const test = require("node:test");
const assert = require("node:assert/strict");
const { analyzeOpportunity } = require("../.test-dist/lib/opportunity/engine.js");

const nowMs = 6 * 60 * 1000;

function candle(time, open, close) {
  return {
    time,
    open,
    high: Math.max(open, close),
    low: Math.min(open, close),
    close,
  };
}

function fiveCandles(directions, movePct = 0.1) {
  return directions.map((direction, index) => {
    const open = 270000;
    const multiplier = direction === "up"
      ? 1 + movePct / 100
      : 1 - movePct / 100;

    return candle((index + 1) * 60, open, open * multiplier);
  });
}

function baseAnalysis(externalPrice = 280000, bitpin = 271000, wallex = 280000) {
  return analyzeOpportunity({
    bitpinCandles: fiveCandles(["up", "up", "up", "up", "down"]),
    wallexCandles: fiveCandles(["up", "up", "up", "up", "up"]),
    currentPrices: { bitpin, wallex },
    externalPrice,
    nowMs,
  });
}

test("external validation succeeds at exactly 0.25%", () => {
  const analysis = baseAnalysis(280000, 271000, 279300);
  assert.ok(Math.abs((analysis.validation.external.actual ?? 0) - 0.25) < 1e-9);
  assert.equal(analysis.validation.external.status, "SUCCESS");
});

test("external validation fails above 0.25%", () => {
  const analysis = baseAnalysis(280000, 271000, 278000);
  assert.ok(Math.abs((analysis.validation.external.actual ?? 0) - 0.7142857142857143) < 1e-9);
  assert.equal(analysis.validation.external.status, "FAILED");
});

test("missing external price is insufficient data", () => {
  const analysis = baseAnalysis(null);
  assert.equal(analysis.validation.external.status, "INSUFFICIENT_DATA");
  assert.equal(analysis.dataCompleteness, 80);
  assert.equal(analysis.stabilityScore, 96.875);
});

test("current prices drive spread independently of candle closes", () => {
  const analysis = baseAnalysis(280000, 271000, 280000);
  assert.equal(analysis.prices.bitpin, 271000);
  assert.equal(analysis.prices.wallex, 280000);
  assert.equal(analysis.spread.absolute, 9000);
  assert.ok(Math.abs((analysis.spread.percent ?? 0) - 3.321033210332103) < 1e-9);
});

test("Bitpin ticker null returns insufficient data without candle fallback", () => {
  const analysis = baseAnalysis(280000, null, 280000);
  assert.equal(analysis.prices.bitpin, null);
  assert.equal(analysis.target.entryPrice, null);
  assert.equal(analysis.validation.wallexAboveBitpin.status, "INSUFFICIENT_DATA");
  assert.equal(analysis.validation.spread.status, "INSUFFICIENT_DATA");
});

test("Wallex ticker null returns insufficient data without candle fallback", () => {
  const analysis = baseAnalysis(280000, 271000, null);
  assert.equal(analysis.prices.wallex, null);
  assert.equal(analysis.target.safeTarget, null);
  assert.equal(analysis.validation.external.status, "INSUFFICIENT_DATA");
  assert.equal(analysis.validation.wallexAboveBitpin.status, "INSUFFICIENT_DATA");
  assert.equal(analysis.validation.spread.status, "INSUFFICIENT_DATA");
});

test("spread at or above 1% succeeds", () => {
  const analysis = baseAnalysis(280000, 271000, 273710);
  assert.ok((analysis.spread.percent ?? 0) >= 1);
  assert.equal(analysis.validation.spread.status, "SUCCESS");
});

test("spread below 1% fails", () => {
  const analysis = baseAnalysis(270000, 270000, 272000);
  assert.ok((analysis.spread.percent ?? 0) < 1);
  assert.equal(analysis.validation.spread.status, "FAILED");
});

test("current incomplete minute is excluded from synchronized candles", () => {
  const analysis = analyzeOpportunity({
    bitpinCandles: fiveCandles(["up", "up", "up", "up", "up"]).concat([
      candle(360, 270000, 280000),
    ]),
    wallexCandles: fiveCandles(["up", "up", "up", "up", "up"]).concat([
      candle(360, 270000, 280000),
    ]),
    currentPrices: { bitpin: 271000, wallex: 280000 },
    externalPrice: 280000,
    nowMs: 360000,
  });
  assert.equal(analysis.candles.synchronized, 5);
});

test("safe target and net edge use current ticker prices and 0.70% taker fees", () => {
  const analysis = baseAnalysis(280000, 271000, 280000);
  assert.equal(analysis.target.entryPrice, 271000);
  assert.equal(analysis.target.safeTarget, 279020);
  assert.equal(analysis.edge.gross, 8020);
  assert.equal(analysis.edge.feesPct, 0.7);
  assert.ok(Math.abs((analysis.edge.grossPct ?? 0) - 2.959409594095941) < 1e-9);
  assert.ok(Math.abs((analysis.edge.netPct ?? 0) - 2.259409594095941) < 1e-9);
});

test("invalid prices and candle values never produce non-finite analysis numbers", () => {
  const analysis = analyzeOpportunity({
    bitpinCandles: [
      candle(60, 270000, Number.NaN),
      candle(120, 270000, Number.POSITIVE_INFINITY),
      candle(180, 270000, 270270),
      candle(240, 270000, 270270),
      candle(300, 270000, 270270),
    ],
    wallexCandles: fiveCandles(["up", "up", "up", "up", "up"]),
    currentPrices: { bitpin: Number.NaN, wallex: Number.POSITIVE_INFINITY },
    externalPrice: Number.NaN,
    nowMs,
  });
  assert.equal(analysis.prices.bitpin, null);
  assert.equal(analysis.prices.wallex, null);
  assert.equal(analysis.prices.external, null);
  assert.equal(analysis.spread.percent, null);
  assert.equal(analysis.edge.netPct, null);
  assert.equal(analysis.validation.external.status, "INSUFFICIENT_DATA");
});

test("Wallex below Bitpin fails without throwing", () => {
  const analysis = baseAnalysis(270000, 271000, 270000);
  assert.equal(analysis.validation.wallexAboveBitpin.status, "FAILED");
  assert.ok((analysis.spread.percent ?? 0) < 0);
});

test("five-candle bullish ratios remain 80% and 100%", () => {
  const analysis = baseAnalysis();
  assert.equal(analysis.candles.synchronized, 5);
  assert.equal(analysis.candles.bitpinBullishRatio, 0.8);
  assert.equal(analysis.candles.wallexBullishRatio, 1);
});

test("cross-exchange alignment remains 80%", () => {
  const analysis = baseAnalysis();
  assert.equal(analysis.candles.alignmentRatio, 0.8);
  assert.equal(analysis.validation.candleAlignment.status, "SUCCESS");
});

test("sub-0.05% candle movement is neutral and not bullish", () => {
  const analysis = analyzeOpportunity({
    bitpinCandles: [
      candle(60, 270000, 270050),
      candle(120, 270000, 270270),
      candle(180, 270000, 270270),
      candle(240, 270000, 270270),
      candle(300, 270000, 270270),
    ],
    wallexCandles: fiveCandles(["up", "up", "up", "up", "up"]),
    currentPrices: { bitpin: 271000, wallex: 280000 },
    externalPrice: 280000,
    nowMs,
  });

  assert.equal(analysis.candles.bitpinBullishRatio, 0.8);
});

test("momentum uses fixed 0.20% reference and clamps at 5", () => {
  for (const [averageMove, expected] of [
    [0.05, 1.25],
    [0.1, 2.5],
    [0.2, 5],
    [0.5, 5],
  ]) {
    const analysis = analyzeOpportunity({
      bitpinCandles: fiveCandles(["up", "up", "up", "up", "up"], averageMove),
      wallexCandles: fiveCandles(["up", "up", "up", "up", "up"], averageMove),
      currentPrices: { bitpin: 271000, wallex: 280000 },
      externalPrice: 280000,
      nowMs,
    });

    assert.ok(Math.abs((analysis.candles.momentumScore ?? 0) - expected) < 1e-9);
  }
});
