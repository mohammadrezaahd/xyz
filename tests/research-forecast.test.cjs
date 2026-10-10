const test = require("node:test");
const assert = require("node:assert/strict");
const { buildLiveForecast } = require("../.test-dist/lib/research/forecast.js");

function candles(count, fn = (i) => 100 + i * 0.1, start = 1_800_000_000) {
  return Array.from({ length: count }, (_, i) => {
    const close = fn(i);
    return { time: start + i * 60, open: close, high: close, low: close, close, volume: 1 };
  });
}

test("forecast refuses to issue a directional call with too little history", () => {
  const result = buildLiveForecast(candles(20), candles(20));
  assert.equal(result.forecasts.length, 3);
  assert.ok(result.forecasts.every((item) => item.direction === "INSUFFICIENT_DATA"));
  assert.ok(result.forecasts.every((item) => item.historicalHitRate === null));
});

test("forecast reports score separately from empirical probability", () => {
  const bitpin = candles(240, (i) => 100 + i * 0.2);
  const wallex = candles(240, (i) => 101 + i * 0.2);
  const result = buildLiveForecast(bitpin, wallex, (1_800_000_000 + 239 * 60 + 60) * 1000);
  assert.ok(result.forecasts.every((item) => item.score !== null));
  assert.ok(result.forecasts.every((item) => item.calibrationSamples >= 30));
  assert.ok(result.forecasts.every((item) => item.historicalHitRate !== null));
  assert.ok(result.forecasts.every((item) => item.direction === "UP"));
});

test("forecast rejects stale candles and gaps in the latest contiguous window", () => {
  const full = candles(100);
  const gapTime = full[95].time;
  const bitpin = full.filter((candle) => candle.time !== gapTime);
  const wallex = full.filter((candle) => candle.time !== gapTime);
  const now = (full[99].time + 60) * 1000;
  const result = buildLiveForecast(bitpin, wallex, now);
  assert.ok(result.forecasts.every((item) => item.direction === "INSUFFICIENT_DATA"));
  assert.ok(result.forecasts.every((item) => item.dataStatus === "INSUFFICIENT_DATA" || item.dataStatus === "STALE_OR_GAPPED"));
});

test("forecast does not calibrate from fewer than 30 comparable historical outcomes", () => {
  const bitpin = candles(50);
  const wallex = candles(50);
  const result = buildLiveForecast(bitpin, wallex, (1_800_000_000 + 49 * 60 + 60) * 1000);
  assert.ok(result.forecasts.every((item) => item.historicalHitRate === null));
});

test("research APIs use the shared candle loader instead of fetching their own deployment URL", () => {
  const fs = require("node:fs");
  for (const path of [
    "app/api/research/forecast/route.ts",
    "app/api/research/backtest/route.ts",
    "app/api/research/regimes/route.ts",
  ]) {
    const route = fs.readFileSync(path, "utf8");
    assert.match(route, /loadCandleHistory/);
    assert.doesNotMatch(route, /fetch\(new URL\("\/api\/candles"/);
  }
});

test("flat synchronized prices do not gain bullish points from venue agreement", () => {
  const flat = candles(100, () => 100);
  const result = buildLiveForecast(flat, flat, (1_800_000_000 + 99 * 60 + 60) * 1000);
  assert.ok(result.forecasts.every((item) => item.direction === "FLAT"));
  assert.ok(result.forecasts.every((item) => item.score === 0));
  assert.ok(result.forecasts.every((item) => item.calibrationSamples >= 30));
  assert.ok(result.forecasts.every((item) => item.historicalHitRate === 1));
});
