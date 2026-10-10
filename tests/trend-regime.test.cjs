const test = require("node:test");
const assert = require("node:assert/strict");
const { buildTrendRegime } = require("../.test-dist/lib/research/trend-regime.js");

const START = 1_800_000_000;
function candles(count, priceAt) {
  return Array.from({ length: count }, (_, i) => {
    const close = priceAt(i);
    return { time: START + i * 60, open: close, high: close * 1.0005, low: close * 0.9995, close, volume: 100 };
  });
}
function run(bitpin, wallex = bitpin, cost = 0.2) {
  const last = bitpin[bitpin.length - 1];
  return buildTrendRegime(bitpin, wallex, { nowMs: (last.time + 60) * 1000, costPerRoundTripPct: cost });
}

test("trend engine identifies a persistent multi-hour bearish regime", () => {
  const falling = candles(900, (i) => 300_000 - i * 18);
  const result = run(falling);
  assert.equal(result.dataStatus, "READY");
  assert.equal(result.direction, "BEARISH");
  assert.ok(result.score < -18);
  assert.ok(result.persistenceVotes.bearish >= 3);
  assert.equal(result.backtest.futureDataUsedForPrediction, false);
});

test("trend engine does not call a brief counter-move a confirmed regime reversal", () => {
  const series = candles(900, (i) => i < 820 ? 300_000 - i * 20 : 283_600 + (i - 820) * 3);
  const result = run(series);
  assert.ok(["BEARISH", "REVERSAL_WATCH", "RANGE"].includes(result.direction));
  assert.notEqual(result.direction, "BULLISH");
});

test("trend engine refuses to infer a multi-hour regime from insufficient history", () => {
  const short = candles(120, (i) => 200_000 + i * 10);
  const result = run(short);
  assert.equal(result.dataStatus, "INSUFFICIENT_DATA");
  assert.equal(result.direction, "INSUFFICIENT_DATA");
  assert.equal(result.entryTiming, "INSUFFICIENT_DATA");
});

test("trend backtest uses a chronological holdout and validates costs", () => {
  const rising = candles(1200, (i) => 200_000 + i * 8);
  const result = run(rising, rising, 0.25);
  assert.equal(result.backtest.costPerRoundTripPct, 0.25);
  assert.equal(result.backtest.futureDataUsedForPrediction, false);
  assert.deepEqual(result.backtest.horizons.map((item) => item.horizonMinutes), [15, 60, 180]);
  assert.ok(result.backtest.horizons.every((item) => item.testSamples > 0));
  assert.throws(() => buildTrendRegime(rising, rising, { costPerRoundTripPct: -1 }), /non-negative/);
});

test("trend engine rejects stale synchronized candles", () => {
  const series = candles(500, (i) => 200_000 + i * 4);
  const last = series[series.length - 1];
  const result = buildTrendRegime(series, series, { nowMs: (last.time + 60 + 181) * 1000 });
  assert.equal(result.dataStatus, "STALE_OR_GAPPED");
  assert.equal(result.direction, "INSUFFICIENT_DATA");
});
