import test from "node:test";
import assert from "node:assert/strict";
import { analyzeOpportunity } from "../lib/opportunity/engine";
import type { Candle } from "../lib/candles";

const nowMs = 6 * 60 * 1000;

function candle(
  time: number,
  open: number,
  close: number,
): Candle {
  return {
    time,
    open,
    high: Math.max(open, close),
    low: Math.min(open, close),
    close,
  };
}

function fiveCandles(
  directions: Array<"up" | "down">,
  movePct = 0.1,
): Candle[] {
  return directions.map((direction, index) => {
    const open = 270000;
    const multiplier =
      direction === "up"
        ? 1 + movePct / 100
        : 1 - movePct / 100;

    return candle(
      (index + 1) * 60,
      open,
      open * multiplier,
    );
  });
}

function baseAnalysis(
  externalPrice: number | null = 280000,
  bitpin = 271000,
  wallex = 280000,
) {
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
  assert.equal(analysis.stabilityScore, 100);
});

test("current prices drive spread independently of candle closes", () => {
  const analysis = baseAnalysis(280000, 271000, 280000);
  assert.equal(analysis.prices.bitpin, 271000);
  assert.equal(analysis.prices.wallex, 280000);
  assert.equal(analysis.spread.absolute, 9000);
  assert.ok(Math.abs((analysis.spread.percent ?? 0) - 3.321033210332103) < 1e-9);
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
  ] as const) {
    const analysis = analyzeOpportunity({
      bitpinCandles: fiveCandles(["up", "up", "up", "up", "up"], averageMove),
      wallexCandles: fiveCandles(["up", "up", "up", "up", "up"], averageMove),
      currentPrices: { bitpin: 271000, wallex: 280000 },
      externalPrice: 280000,
      nowMs,
    });

    assert.ok(
      Math.abs(
        (analysis.candles.momentumScore ?? 0) - expected,
      ) < 1e-9,
    );
  }
});
