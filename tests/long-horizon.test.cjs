const test = require("node:test");
const assert = require("node:assert/strict");
const { buildLongHorizonForecast } = require("../.test-dist/lib/research/long-horizon.js");

const HOUR = 3600;
const START = 1_700_006_400;
function candles(count, priceAt, venueOffset = 0, timeOffsetSeconds = 0) {
  return Array.from({ length: count }, (_, index) => {
    const close = priceAt(index) + venueOffset;
    return {
      time: START + index * HOUR + timeOffsetSeconds,
      open: close - 2,
      high: close + 5,
      low: close - 5,
      close,
      volume: 100 + (index % 24) * 3,
    };
  });
}
function run(bitpin, wallex = bitpin, cost = 0.2) {
  const last = bitpin[bitpin.length - 1];
  return buildLongHorizonForecast(bitpin, wallex, { nowMs: (last.time + HOUR) * 1000, costPerRoundTripPct: cost });
}

test("long-horizon engine forecasts 24 hours and 7 days using synchronized closed hourly candles", () => {
  const rising = candles(1600, (index) => 250_000 + index * 20);
  const result = run(rising, candles(1600, (index) => 250_000 + index * 18));
  assert.equal(result.dataStatus, "READY");
  assert.equal(result.model, "hourly-multi-factor-walk-forward-v1");
  assert.deepEqual(result.forecasts.map((row) => row.horizonHours), [24, 168]);
  assert.ok(result.forecasts.every((row) => row.score !== null && row.support !== null && row.resistance !== null));
});

test("long-horizon live prediction is invariant to candles after the prediction timestamp", () => {
  const base = candles(1600, (index) => 250_000 + index * 20);
  const wallex = candles(1600, (index) => 250_000 + index * 18);
  const cutoff = base[1500].time;
  const first = buildLongHorizonForecast(base.slice(0, 1500), wallex.slice(0, 1500), { nowMs: cutoff * 1000 });
  const extended = buildLongHorizonForecast(base, wallex, { nowMs: cutoff * 1000 });
  assert.deepEqual(extended.forecasts.map((row) => ({ direction: row.direction, score: row.score })), first.forecasts.map((row) => ({ direction: row.direction, score: row.score })));
});

test("weekly horizon backtest uses a chronological holdout and reports sample sufficiency", () => {
  const rising = candles(1800, (index) => 250_000 + index * 20);
  const result = run(rising);
  assert.equal(result.backtest.split, "CHRONOLOGICAL_FINAL_20_PERCENT");
  assert.equal(result.backtest.costPerRoundTripPct, 0.2);
  assert.ok(result.backtest.metrics.every((metric) => metric.testSamples > 0));
  assert.equal(result.backtest.metrics.find((metric) => metric.horizonHours === 168).status, "EVALUATED");
});

test("long-horizon engine rejects invalid costs and insufficient hourly history", () => {
  const short = candles(500, (index) => 250_000 + index * 20);
  assert.equal(run(short).dataStatus, "INSUFFICIENT_DATA");
  assert.throws(() => buildLongHorizonForecast(short, short, { costPerRoundTripPct: -1 }), /non-negative/);
});
