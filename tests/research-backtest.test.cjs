const test = require("node:test");
const assert = require("node:assert/strict");
const { runResearchBacktest } = require("../.test-dist/lib/research/backtest.js");

function series(count, priceFn = (i) => 100 + i * 0.1) {
  return Array.from({ length: count }, (_, i) => {
    const close = priceFn(i);
    return { time: 1_800_000_000 + i * 60, open: close, high: close, low: close, close, volume: 1 };
  });
}

test("backtest evaluates 5, 15, and 30 minute horizons with chronological splits", () => {
  const candles = series(180);
  const result = runResearchBacktest(candles, candles, { costPerRoundTripPct: 0.2 });
  assert.deepEqual(result.metrics.map((metric) => metric.horizonMinutes), [5, 15, 30]);
  assert.equal(result.method, "multi-feature-regime-v1");
  for (const metric of result.metrics) {
    assert.ok(metric.samples > 0);
    assert.equal(metric.trainSamples + metric.tuneSamples + metric.testSamples, metric.samples);
    assert.ok(metric.testSamples > 0);
    assert.equal(metric.testSampleStatus, "INSUFFICIENT_SAMPLE");
    assert.equal(metric.costPerRoundTripPct, 0.2);
  }
  assert.equal(result.split.chronological, true);
  assert.equal(result.assumptions.futureDataUsedForPrediction, false);
  assert.ok(result.samples.some((sample) => sample.split === "TEST"));
});

test("backtest scores and directional calls are horizon-specific", () => {
  const candles = series(180);
  const result = runResearchBacktest(candles, candles, { costPerRoundTripPct: 0.2 });
  const grouped = new Map();
  for (const sample of result.samples) {
    if (!grouped.has(sample.timestamp)) grouped.set(sample.timestamp, []);
    grouped.get(sample.timestamp).push(sample);
  }
  const sameTimestamp = [...grouped.values()].find((rows) => rows.length === 3);
  assert.ok(sameTimestamp, "expected at least one timestamp evaluated at all horizons");
  assert.equal(new Set(sameTimestamp.map((row) => row.directionalScore)).size, 3,
    "5m, 15m and 30m backtest samples must not reuse one shared score");
  for (const sample of sameTimestamp) {
    const expected = sample.directionalScore >= 20 ? "UP" : sample.directionalScore <= -20 ? "DOWN" : "FLAT";
    assert.equal(sample.predictedDirection, expected);
  }
});

test("backtest never reports success when there are not enough synchronized candles", () => {
  const result = runResearchBacktest(series(10), series(9));
  assert.equal(result.input.synchronizedCandles, 9);
  assert.ok(result.metrics.every((metric) => metric.samples === 0));
  assert.ok(result.metrics.every((metric) => metric.testDirectionalAccuracy === null));
});

test("backtest excludes windows crossing missing minute candles", () => {
  const complete = series(120);
  const gapTime = complete[55].time;
  const bitpin = complete.filter((candle) => candle.time !== gapTime);
  const wallex = complete.filter((candle) => candle.time !== gapTime);
  const result = runResearchBacktest(bitpin, wallex);
  for (const sample of result.samples) {
    for (let offset = 1; offset <= 30; offset += 1) {
      assert.ok(bitpin.some((candle) => candle.time === sample.timestamp - offset * 60));
    }
    for (let offset = 1; offset <= sample.horizonMinutes; offset += 1) {
      assert.ok(bitpin.some((candle) => candle.time === sample.timestamp + offset * 60));
    }
  }
});

test("backtest validates transaction cost assumptions", () => {
  assert.throws(() => runResearchBacktest(series(60), series(60), { costPerRoundTripPct: -1 }), /non-negative/);
});

test("backtest net returns deduct costs from directional positions", () => {
  const rising = series(100, (i) => 100 + i);
  const result = runResearchBacktest(rising, rising, { costPerRoundTripPct: 0.5, minimumMomentumPct: 0.001 });
  const testedTrades = result.samples.filter((sample) => sample.split === "TEST" && sample.predictedDirection !== "FLAT");
  assert.ok(testedTrades.length > 0);
  assert.ok(testedTrades.every((sample) => Math.abs(sample.netStrategyReturnPct - (sample.grossStrategyReturnPct - 0.5)) < 1e-8));
});
