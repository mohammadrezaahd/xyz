const test = require("node:test");
const assert = require("node:assert/strict");
const { fetchWallexChunks } = require("../.test-dist/lib/wallex-candles.js");

function candle(time, open = 100, close = 101) {
  return {
    time,
    open,
    high: Math.max(open, close),
    low: Math.min(open, close),
    close,
  };
}

test("Wallex chunk retrieval keeps successful chunks when one chunk fails", async () => {
  const chunks = [
    { from: 0, to: 10 },
    { from: 10, to: 20 },
    { from: 20, to: 30 },
  ];

  const result = await fetchWallexChunks(
    chunks,
    async (chunk) => {
      if (chunk.from === 10) {
        throw new Error("simulated chunk failure");
      }

      return [candle(chunk.from)];
    },
    2,
  );

  assert.equal(result.candles.length, 2);
  assert.deepEqual(
    result.candles.map((item) => item.time).sort((a, b) => a - b),
    [0, 20],
  );
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].from, 10);
  assert.match(result.failures[0].error, /simulated chunk failure/);
});

test("Wallex no_data chunks are not treated as failures", async () => {
  const result = await fetchWallexChunks(
    [
      { from: 0, to: 10 },
      { from: 10, to: 20 },
    ],
    async (chunk) => (chunk.from === 10 ? [] : [candle(chunk.from)]),
  );

  assert.equal(result.candles.length, 1);
  assert.equal(result.failures.length, 0);
});
