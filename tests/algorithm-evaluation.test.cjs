const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluateResearchObservations, MIN_RESEARCH_SAMPLE_SIZE } = require("../.test-dist/lib/research/algorithm-evaluation.js");

function observation(result = "PREDICT_SUCCESS", version = "phase-5a-live-default-v1") {
  return {
    configurationVersion: version,
    status: "RESOLVED",
    actual: { resolvedAt: new Date(), result, netPnl: 10, roi: 1, durationMs: 60000 },
    prediction: { riskLevel: "LOW", stabilityScore: 80 },
    market: { spreadPct: 0.5 },
    candles: { lookback: 10 },
  };
}

test("algorithm evaluation returns INSUFFICIENT_SAMPLE below minimum", () => {
  assert.equal(evaluateResearchObservations([observation()], "phase-5a-live-default-v1").status, "INSUFFICIENT_SAMPLE");
});

test("algorithm evaluation evaluates exactly the minimum resolved sample", () => {
  const observations = Array.from({ length: MIN_RESEARCH_SAMPLE_SIZE }, (_, i) => observation(i % 5 === 0 ? "LIQUIDATED" : "PREDICT_SUCCESS"));
  const result = evaluateResearchObservations(observations, "phase-5a-live-default-v1");
  assert.equal(result.status, "OK");
  assert.equal(result.sampleCount, MIN_RESEARCH_SAMPLE_SIZE);
  assert.ok(result.liquidationRate > 0);
  assert.equal(result.recommendation, "NO_CHANGE");
});

test("other configuration versions are excluded", () => {
  const observations = Array.from({ length: MIN_RESEARCH_SAMPLE_SIZE }, () => observation());
  observations[0] = observation("PREDICT_SUCCESS", "future-v2");
  assert.equal(evaluateResearchObservations(observations, "phase-5a-live-default-v1").sampleCount, MIN_RESEARCH_SAMPLE_SIZE - 1);
});
