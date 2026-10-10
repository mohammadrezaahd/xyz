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
  assert.equal(result.forecasts.length, 4);
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
  assert.equal(result.forecasts[0].horizonMinutes, 5);
  assert.equal(result.forecasts[1].horizonMinutes, 15);
  assert.equal(result.forecasts[2].horizonMinutes, 30);
  assert.equal(result.forecasts[3].horizonMinutes, 60);
  assert.equal(new Set(result.forecasts.map((item) => item.score)).size, 4,
    "each horizon must calculate its own score rather than reuse one shared score");
});

test("bearish forecast reports a signed negative market-return estimate", () => {
  const bitpin = candles(240, (i) => 100 - i * 0.2);
  const wallex = candles(240, (i) => 101 - i * 0.2);
  const result = buildLiveForecast(bitpin, wallex, (1_800_000_000 + 239 * 60 + 60) * 1000);
  for (const item of result.forecasts) {
    assert.equal(item.direction, "DOWN");
    assert.ok(item.expectedReturnPct !== null && item.expectedReturnPct < 0,
      "expectedReturnPct is a signed price-return estimate, not a direction-adjusted profit proxy");
  }
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
  const flat = candles(160, () => 100);
  const result = buildLiveForecast(flat, flat, (1_800_000_000 + 159 * 60 + 60) * 1000);
  assert.ok(result.forecasts.every((item) => item.direction === "FLAT"));
  assert.ok(result.forecasts.every((item) => item.score === 0));
  assert.ok(result.forecasts.every((item) => item.calibrationSamples >= 30));
  assert.ok(result.forecasts.every((item) => item.historicalHitRate === 1));
});
