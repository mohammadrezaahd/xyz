const test = require("node:test");
const assert = require("node:assert/strict");
const { analyzeOpportunity } = require("../.test-dist/lib/opportunity/engine.js");

const nowMs = 40 * 60 * 1000;

function candle(time, open, close) {
  return {
    time,
    open,
    high: Math.max(open, close),
    low: Math.min(open, close),
    close,
  };
}

function candles(directions, movePct = 0.1, start = 1) {
  return directions.map((direction, index) => {
    const open = 270000;
    const multiplier =
      direction === "up"
        ? 1 + movePct / 100
        : direction === "down"
          ? 1 - movePct / 100
          : 1 + 0.01 / 100;

    return candle(
      (start + index) * 60,
      open,
      open * multiplier,
    );
  });
}

function atLeastThirty(directions) {
  return Array.from({ length: 30 }, (_, index) => directions[index % directions.length]);
}

function baseAnalysis(
  externalPrice = 280000,
  bitpin = 271000,
  wallex = 280000,
  bitpinDirections = Array(10).fill("up").map((_, i) => i === 9 ? "down" : "up"),
  wallexDirections = Array(10).fill("up"),
) {
  return analyzeOpportunity({
    bitpinCandles: candles(atLeastThirty(bitpinDirections)),
    wallexCandles: candles(atLeastThirty(wallexDirections)),
    currentPrices: { bitpin, wallex },
    externalPrice,
    nowMs,
  });
}

test("external validation succeeds at 0.40% threshold", () => {
  const analysis = baseAnalysis(268000, 271000, 268786);
  assert.ok(Math.abs((analysis.validation.external.actual ?? 0) - 0.29328358208955224) < 1e-9);
  assert.equal(analysis.validation.external.threshold, 0.4);
  assert.equal(analysis.validation.external.status, "SUCCESS");
});

test("external validation fails above 0.40%", () => {
  const analysis = baseAnalysis(267000, 271000, 268786);
assert.ok(
  Math.abs(
    (analysis.validation.external.actual ?? 0) - 0.6689138576779027,
  ) < 1e-9,
);  assert.equal(analysis.validation.external.threshold, 0.4);
  assert.equal(analysis.validation.external.status, "FAILED");
});

test("missing external price is insufficient data and does not consume weight", () => {
  const analysis = baseAnalysis(null);
  assert.equal(analysis.validation.external.status, "INSUFFICIENT_DATA");
  assert.equal(analysis.dataCompleteness, 80);
  assert.equal(analysis.stabilityScore, 96.875);
});

test("current ticker prices drive spread independently of candle closes", () => {
  const analysis = baseAnalysis(280000, 271000, 280000);
  assert.equal(analysis.prices.bitpin, 271000);
  assert.equal(analysis.prices.wallex, 280000);
  assert.equal(analysis.spread.absolute, 9000);
  assert.ok(Math.abs((analysis.spread.percent ?? 0) - 3.321033210332103) < 1e-9);
});

test("Bitpin ticker null never falls back to candle close", () => {
  const analysis = baseAnalysis(280000, null, 280000);
  assert.equal(analysis.prices.bitpin, null);
  assert.equal(analysis.target.entryPrice, null);
  assert.equal(analysis.validation.wallexAboveBitpin.status, "INSUFFICIENT_DATA");
  assert.equal(analysis.validation.spread.status, "INSUFFICIENT_DATA");
});

test("Wallex ticker null never falls back to candle close", () => {
  const analysis = baseAnalysis(280000, 271000, null);
  assert.equal(analysis.prices.wallex, null);
  assert.equal(analysis.target.safeTarget, null);
  assert.equal(analysis.validation.external.status, "INSUFFICIENT_DATA");
  assert.equal(analysis.validation.wallexAboveBitpin.status, "INSUFFICIENT_DATA");
  assert.equal(analysis.validation.spread.status, "INSUFFICIENT_DATA");
});

test("spread at 1% succeeds", () => {
  const analysis = baseAnalysis(280000, 270000, 272700);
  assert.ok(Math.abs((analysis.spread.percent ?? 0) - 1) < 1e-9);
  assert.equal(analysis.validation.spread.status, "SUCCESS");
});

test("spread at 0.99% is acceptable independently from Wallex > Bitpin", () => {
  const analysis = baseAnalysis(270000, 100000, 100990);
  assert.ok(Math.abs((analysis.spread.percent ?? 0) - 0.99) < 1e-9);
  assert.equal(analysis.validation.wallexAboveBitpin.status, "SUCCESS");
  assert.equal(analysis.validation.spread.status, "ACCEPTABLE");
});

test("spread at exactly 1.00% is SUCCESS", () => {
  const analysis = baseAnalysis(270000, 100000, 101000);
  assert.ok(Math.abs((analysis.spread.percent ?? 0) - 1) < 1e-9);
  assert.equal(analysis.validation.spread.status, "SUCCESS");
});

test("spread at exactly 0.50% is ACCEPTABLE", () => {
  const analysis = baseAnalysis(270000, 100000, 100500);
  assert.ok(Math.abs((analysis.spread.percent ?? 0) - 0.5) < 1e-9);
  assert.equal(analysis.validation.spread.status, "ACCEPTABLE");
});

test("spread at 0.49% is FAILED", () => {
  const analysis = baseAnalysis(270000, 100000, 100490);
  assert.ok(Math.abs((analysis.spread.percent ?? 0) - 0.49) < 1e-9);
  assert.equal(analysis.validation.spread.status, "FAILED");
});

test("missing Bitpin price produces INSUFFICIENT_DATA for spread threshold", () => {
  const analysis = baseAnalysis(270000, null, 101000);
  assert.equal(analysis.spread.percent, null);
  assert.equal(analysis.validation.spread.status, "INSUFFICIENT_DATA");
});

test("missing Wallex price produces INSUFFICIENT_DATA for spread threshold", () => {
  const analysis = baseAnalysis(270000, 100000, null);
  assert.equal(analysis.spread.percent, null);
  assert.equal(analysis.validation.spread.status, "INSUFFICIENT_DATA");
});

test("reported Bitpin/Wallex prices produce an acceptable 0.5123% spread", () => {
  const analysis = baseAnalysis(270000, 267416, 268786);
  assert.ok(Math.abs((analysis.spread.percent ?? 0) - 0.5123104077542107) < 1e-9);
  assert.equal(analysis.validation.spread.status, "ACCEPTABLE");
});

test("Wallex below Bitpin fails independently from spread", () => {
  const analysis = baseAnalysis(270000, 271000, 270000);
  assert.equal(analysis.validation.wallexAboveBitpin.status, "FAILED");
  assert.ok((analysis.spread.percent ?? 0) < 0);
});

test("analysis uses a 30-pair window while requiring at least 20 pairs", () => {
  const analysis = baseAnalysis();
  assert.equal(analysis.candles.lookback, 30);
  assert.equal(analysis.candles.synchronizedAvailable, 30);
  assert.equal(analysis.candles.synchronizedUsed, 30);
  assert.equal(analysis.candles.minimumRequired, 20);
});

test("current incomplete minute is excluded", () => {
  const analysis = analyzeOpportunity({
    bitpinCandles: candles(Array(10).fill("up"), 0.1).concat([
      candle(660, 270000, 280000),
    ]),
    wallexCandles: candles(Array(10).fill("up"), 0.1).concat([
      candle(660, 270000, 280000),
    ]),
    currentPrices: { bitpin: 271000, wallex: 280000 },
    externalPrice: 280000,
    nowMs: 660000,
  });
  assert.equal(analysis.candles.synchronized, 10);
});

test("1-minute bucket synchronization matches offset timestamps", () => {
  const bitpin = candles(Array(25).fill("up"));
  const wallex = candles(Array(25).fill("up")).map((c) => ({
    ...c,
    time: c.time + 30,
  }));

  const analysis = analyzeOpportunity({
    bitpinCandles: bitpin,
    wallexCandles: wallex,
    currentPrices: { bitpin: 271000, wallex: 280000 },
    externalPrice: 280000,
    nowMs,
  });

  assert.equal(analysis.candles.synchronizedAvailable, 25);
  assert.equal(analysis.validation.candleAlignment.status, "SUCCESS");
  assert.equal(analysis.candles.alignmentRatio, 1);
});

test("duplicate candles in one minute bucket do not inflate synchronization", () => {
  const bitpin = candles(Array(10).fill("up")).concat([
    candle(60 + 45, 270000, 270270),
  ]);
  const wallex = candles(Array(10).fill("up")).map((c) => ({
    ...c,
    time: c.time + 30,
  }));

  const analysis = analyzeOpportunity({
    bitpinCandles: bitpin,
    wallexCandles: wallex,
    currentPrices: { bitpin: 271000, wallex: 280000 },
    externalPrice: 280000,
    nowMs,
  });

  assert.equal(analysis.candles.synchronized, 10);
});

test("offset current-minute candles remain excluded", () => {
  const bitpin = candles(Array(10).fill("up")).concat([
    candle(660 + 30, 270000, 280000),
  ]);
  const wallex = candles(Array(10).fill("up")).concat([
    candle(660 + 45, 270000, 280000),
  ]);

  const analysis = analyzeOpportunity({
    bitpinCandles: bitpin,
    wallexCandles: wallex,
    currentPrices: { bitpin: 271000, wallex: 280000 },
    externalPrice: 280000,
    nowMs: 660000,
  });

  assert.equal(analysis.candles.synchronized, 10);
});

test("9 synchronized candles are insufficient", () => {
  const bitpin = candles(Array(10).fill("up"));
  const wallex = candles(Array(10).fill("up")).slice(1);
  const analysis = analyzeOpportunity({
    bitpinCandles: bitpin,
    wallexCandles: wallex,
    currentPrices: { bitpin: 271000, wallex: 280000 },
    externalPrice: 280000,
    nowMs,
  });
  assert.equal(analysis.candles.synchronized, 9);
  assert.equal(analysis.validation.candleAlignment.status, "INSUFFICIENT_DATA");
  assert.equal(analysis.validation.bitpinBullish.status, "INSUFFICIENT_DATA");
  assert.equal(analysis.validation.wallexBullish.status, "INSUFFICIENT_DATA");
});

test("selected candle diagnostics preserve the exact bullish classification", () => {
  const bitpinDirections = ["up", "up", "up", "up", "down", "neutral", "down", "neutral", "down", "down"];
  const analysis = baseAnalysis(
    280000,
    271000,
    280000,
    bitpinDirections,
    Array(10).fill("up"),
  );

  assert.equal(analysis.candles.selected.length, 10);
  assert.equal(analysis.candles.bitpinBullishRatio, 0.4);
  assert.deepEqual(
    analysis.candles.selected.map((pair) => pair.bitpin.direction),
    [
      "BULLISH",
      "BULLISH",
      "BULLISH",
      "BULLISH",
      "BEARISH",
      "NEUTRAL",
      "BEARISH",
      "NEUTRAL",
      "BEARISH",
      "BEARISH",
    ],
  );
  assert.ok(
    analysis.candles.selected.every(
      (pair) => typeof pair.bitpin.movementPct === "number",
    ),
  );
});

test("red candle below the minimum movement remains NEUTRAL in diagnostics", () => {
  const bitpin = candles(Array(10).fill("up"));
  bitpin[0] = candle(60, 270000, 269950);

  const analysis = analyzeOpportunity({
    bitpinCandles: bitpin,
    wallexCandles: candles(Array(10).fill("up")),
    currentPrices: { bitpin: 271000, wallex: 280000 },
    externalPrice: 280000,
    nowMs,
  });

  assert.equal(analysis.candles.selected[0].bitpin.direction, "NEUTRAL");
  assert.ok(analysis.candles.selected[0].bitpin.movementPct < 0.05);
});

test("green candle below the minimum movement remains NEUTRAL in diagnostics", () => {
  const bitpin = candles(Array(10).fill("up"));
  bitpin[0] = candle(60, 270000, 270050);

  const analysis = analyzeOpportunity({
    bitpinCandles: bitpin,
    wallexCandles: candles(Array(10).fill("up")),
    currentPrices: { bitpin: 271000, wallex: 280000 },
    externalPrice: 280000,
    nowMs,
  });

  assert.equal(analysis.candles.selected[0].bitpin.direction, "NEUTRAL");
  assert.ok(analysis.candles.selected[0].bitpin.movementPct < 0.05);
});

test("bullish ratio classification is 40 FAILED, 50/70 ACCEPTABLE, 80/100 SUCCESS", () => {
  const cases = [
    [4, "FAILED"],
    [5, "ACCEPTABLE"],
    [7, "ACCEPTABLE"],
    [8, "SUCCESS"],
    [10, "SUCCESS"],
  ];

  for (const [bullishCount, expected] of cases) {
    const bitpinDirections = Array.from({ length: 10 }, (_, i) =>
      i < bullishCount ? "up" : "down",
    );
    const analysis = baseAnalysis(
      280000,
      271000,
      280000,
      bitpinDirections,
      Array(10).fill("up"),
    );
    assert.equal(analysis.candles.bitpinBullishRatio, bullishCount / 10);
    assert.equal(analysis.validation.bitpinBullish.status, expected);
  }
});

test("acceptable bullish ratio receives proportional score, not full weight", () => {
  const analysis = baseAnalysis(
    280000,
    271000,
    280000,
    Array.from({ length: 10 }, (_, i) => i < 6 ? "up" : "down"),
    Array(10).fill("up"),
  );
  assert.equal(analysis.validation.bitpinBullish.status, "ACCEPTABLE");
  assert.equal(analysis.candles.bitpinBullishRatio, 0.6);
});

test("10 synchronized Neutral/Neutral candles produce 100% alignment", () => {
  const analysis = analyzeOpportunity({
    bitpinCandles: candles(Array(10).fill("neutral")),
    wallexCandles: candles(Array(10).fill("neutral")),
    currentPrices: { bitpin: 271000, wallex: 280000 },
    externalPrice: 280000,
    nowMs,
  });

  assert.equal(analysis.candles.synchronized, 10);
  assert.equal(analysis.candles.alignmentRatio, 1);
  assert.equal(analysis.validation.candleAlignment.status, "SUCCESS");
});

test("5 aligned and 5 non-aligned synchronized candles produce 50% alignment", () => {
  const bitpinDirections = Array(10).fill("up");
  const wallexDirections = Array.from({ length: 10 }, (_, i) =>
    i < 5 ? "up" : "down",
  );

  const analysis = analyzeOpportunity({
    bitpinCandles: candles(bitpinDirections),
    wallexCandles: candles(wallexDirections),
    currentPrices: { bitpin: 271000, wallex: 280000 },
    externalPrice: 280000,
    nowMs,
  });

  assert.equal(analysis.candles.synchronized, 10);
  assert.equal(analysis.candles.alignmentRatio, 0.5);
  assert.equal(analysis.validation.candleAlignment.status, "ACCEPTABLE");
});

test("3 aligned and 7 non-aligned synchronized candles produce 30% alignment", () => {
  const bitpinDirections = Array(10).fill("up");
  const wallexDirections = Array.from({ length: 10 }, (_, i) =>
    i < 3 ? "up" : "down",
  );

  const analysis = analyzeOpportunity({
    bitpinCandles: candles(bitpinDirections),
    wallexCandles: candles(wallexDirections),
    currentPrices: { bitpin: 271000, wallex: 280000 },
    externalPrice: 280000,
    nowMs,
  });

  assert.equal(analysis.candles.synchronized, 10);
  assert.equal(analysis.candles.alignmentRatio, 0.3);
  assert.equal(analysis.validation.candleAlignment.status, "FAILED");
});

test("alignment classification is 8 SUCCESS, 7/5 ACCEPTABLE, 4 FAILED", () => {
  const cases = [
    [8, "SUCCESS"],
    [7, "ACCEPTABLE"],
    [5, "ACCEPTABLE"],
    [4, "FAILED"],
  ];

  for (const [alignedCount, expected] of cases) {
    const wallexDirections = Array.from({ length: 10 }, (_, i) =>
      i < alignedCount ? "up" : "down",
    );
    const analysis = baseAnalysis(
      280000,
      271000,
      280000,
      Array(10).fill("up"),
      wallexDirections,
    );
    assert.equal(analysis.candles.alignmentRatio, alignedCount / 10);
    assert.equal(analysis.validation.candleAlignment.status, expected);
  }
});

test("sub-0.05% movement is neutral and not bullish", () => {
  const bitpin = candles(Array(10).fill("up"));
  bitpin[0] = candle(60, 270000, 270050);
  const analysis = analyzeOpportunity({
    bitpinCandles: bitpin,
    wallexCandles: candles(Array(10).fill("up")),
    currentPrices: { bitpin: 271000, wallex: 280000 },
    externalPrice: 280000,
    nowMs,
  });
  assert.equal(analysis.candles.bitpinBullishRatio, 0.9);
});

test("momentum uses fixed 0.20% reference and clamps at 5", () => {
  for (const [averageMove, expected] of [
    [0.05, 1.25],
    [0.1, 2.5],
    [0.2, 5],
    [0.5, 5],
  ]) {
    const analysis = analyzeOpportunity({
      bitpinCandles: candles(Array(10).fill("up"), averageMove),
      wallexCandles: candles(Array(10).fill("up"), averageMove),
      currentPrices: { bitpin: 271000, wallex: 280000 },
      externalPrice: 280000,
      nowMs,
    });
    assert.ok(Math.abs((analysis.candles.momentumScore ?? 0) - expected) < 1e-9);
  }
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
    bitpinCandles: candles(Array(10).fill("up")),
    wallexCandles: candles(Array(10).fill("up")),
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


test("10 synchronized pairs remain insufficient and are counted before the analysis gate", () => {
  const ten = candles(Array(10).fill("up"));
  const analysis = analyzeOpportunity({ bitpinCandles: ten, wallexCandles: ten, currentPrices: { bitpin: { price: 271000, fetchedAt: nowMs }, wallex: { price: 280000, fetchedAt: nowMs } }, externalReference: { price: 280000, fetchedAt: nowMs, provider: "fixture", error: null }, nowMs });
  assert.equal(analysis.buySellBalance.value, null);
  assert.equal(analysis.buySellBalance.label, "INSUFFICIENT DATA");
  assert.equal(analysis.candles.synchronizedAvailable, 10);
  assert.equal(analysis.candles.minimumRequired, 20);
});

test("25 aligned bullish pairs produce BUY BIAS independently from economic rejection", () => {
  const up = candles(Array(25).fill("up"));
  const analysis = analyzeOpportunity({ bitpinCandles: up, wallexCandles: up, currentPrices: { bitpin: { price: 271000, fetchedAt: nowMs }, wallex: { price: 271100, fetchedAt: nowMs } }, externalReference: { price: 271100, fetchedAt: nowMs, provider: "fixture", error: null }, nowMs });
  assert.notEqual(analysis.buySellBalance.value, null);
  assert.equal(analysis.buySellBalance.label, "BUY BIAS");
  assert.equal(analysis.candles.synchronizedAvailable, 25);
  assert.equal(analysis.candles.synchronizedUsed, 25);
  assert.equal(analysis.decision, "NO_TRADE_NEGATIVE_EDGE");
});

test("25 aligned bearish pairs produce research-only SELL BIAS", () => {
  const down = candles(Array(25).fill("down"));
  const analysis = analyzeOpportunity({ bitpinCandles: down, wallexCandles: down, currentPrices: { bitpin: { price: 271000, fetchedAt: nowMs }, wallex: { price: 271100, fetchedAt: nowMs } }, externalReference: { price: 271100, fetchedAt: nowMs, provider: "fixture", error: null }, nowMs });
  assert.notEqual(analysis.buySellBalance.value, null);
  assert.equal(analysis.buySellBalance.label, "SELL BIAS");
  assert.equal(analysis.buySellBalance.executionRoute, "NONE");
});

test("25 mixed aligned pairs produce a real balanced numeric score", () => {
  const mixed = candles(Array.from({ length: 25 }, (_, i) => i % 2 ? "up" : "down"));
  const analysis = analyzeOpportunity({ bitpinCandles: mixed, wallexCandles: mixed, currentPrices: { bitpin: { price: 271000, fetchedAt: nowMs }, wallex: { price: 271100, fetchedAt: nowMs } }, externalReference: { price: 271100, fetchedAt: nowMs, provider: "fixture", error: null }, nowMs });
  assert.notEqual(analysis.buySellBalance.value, null);
  assert.equal(analysis.buySellBalance.label, "BALANCED");
});
