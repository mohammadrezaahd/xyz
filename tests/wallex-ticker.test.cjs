const test = require("node:test");
const assert = require("node:assert/strict");
const { fetchWallexTickerPrice } = require("../.test-dist/lib/wallex-ticker.js");

function response(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

test("Wallex ticker uses the public market endpoint without requiring an API key", async () => {
  const urls = [];
  const price = await fetchWallexTickerPrice({
    fetchImpl: async (url) => {
      urls.push(String(url));
      return response({ success: true, result: { symbols: { USDTTMN: { stats: { lastPrice: "265123" } } } } });
    },
  });
  assert.equal(price, 265123);
  assert.equal(urls.length, 1);
  assert.match(urls[0], /\/v1\/markets$/);
});

test("Wallex ticker retries public timeout and then uses authenticated OTC fallback", async () => {
  const urls = [];
  let publicCalls = 0;
  const price = await fetchWallexTickerPrice({
    apiKey: "test-key",
    timeoutMs: 1500,
    fetchImpl: async (url, init) => {
      urls.push({ url: String(url), hasApiKey: Boolean(init?.headers && init.headers["x-api-key"]) });
      if (String(url).endsWith("/v1/markets")) {
        publicCalls += 1;
        throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      }
      return response({ success: true, result: { USDTTMN: { stats: { lastPrice: "265456" } } } });
    },
  });
  assert.equal(price, 265456);
  assert.equal(publicCalls, 2);
  assert.equal(urls.length, 3);
  assert.equal(urls[2].hasApiKey, true);
  assert.match(urls[2].url, /\/v1\/otc\/markets$/);
});

test("Wallex ticker fails clearly when public and authenticated endpoints cannot supply a valid price", async () => {
  let calls = 0;
  await assert.rejects(
    fetchWallexTickerPrice({
      apiKey: "test-key",
      fetchImpl: async () => {
        calls += 1;
        return response({ success: true, result: {} });
      },
    }),
    /Unable to fetch Wallex USDTTMN ticker/,
  );
  assert.equal(calls, 3);
});

test("Wallex ticker clamps unsafe timeout configuration", async () => {
  const signals = [];
  await fetchWallexTickerPrice({
    timeoutMs: 99_000,
    fetchImpl: async (_url, init) => {
      signals.push(init.signal);
      return response({ result: { symbols: { USDTTMN: { stats: { lastPrice: 123 } } } } });
    },
  });
  assert.equal(signals.length, 1);
  assert.equal(signals[0].aborted, false);
});
