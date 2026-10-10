import { analyzeOpportunity } from "./lib/opportunity/engine";
import type { Candle } from "./lib/candles";

const nowMs = 3_000_000;
function buildCandles(direction: "up" | "down" | "mixed", count: number): Candle[] {
  return Array.from({ length: count }, (_, index) => {
    const open = 270_000;
    const bullish = direction === "up" || (direction === "mixed" && index % 2 === 1);
    const close = open * (bullish ? 1.001 : 0.999);
    return { time: (index + 1) * 60, open, high: Math.max(open, close), low: Math.min(open, close), close };
  });
}
function analyze(direction: "up" | "down" | "mixed", count: number) {
  const candles = buildCandles(direction, count);
  return analyzeOpportunity({
    bitpinCandles: candles,
    wallexCandles: candles,
    currentPrices: {
      bitpin: { price: 271_000, fetchedAt: nowMs },
      wallex: { price: 271_100, fetchedAt: nowMs },
    },
    externalReference: { price: 271_100, fetchedAt: nowMs, provider: "deterministic-fixture", error: null },
    nowMs,
  });
}
const cases = [
  ["BUY FIXTURE", analyze("up", 25), "BUY BIAS"],
  ["SELL FIXTURE", analyze("down", 25), "SELL BIAS"],
  ["BALANCED FIXTURE", analyze("mixed", 25), "BALANCED"],
  ["INSUFFICIENT FIXTURE", analyze("up", 10), "INSUFFICIENT DATA"],
] as const;
for (const [name, result, expected] of cases) {
  console.log(name + ": " + result.buySellBalance.label);
  if (result.buySellBalance.label !== expected) {
    throw new Error(name + " expected " + expected + " but got " + result.buySellBalance.label);
  }
}
if (cases[0][1].buySellBalance.value === null || cases[1][1].buySellBalance.value === null || cases[2][1].buySellBalance.value === null) {
  throw new Error("A sufficient 25-pair fixture returned no numeric balance");
}
if (cases[3][1].buySellBalance.value !== null || cases[3][1].candles.synchronizedAvailable !== 10 || cases[3][1].candles.minimumRequired !== 20) {
  throw new Error("The 10-pair fixture must remain insufficient with an uncapped count");
}
if (cases[0][1].decision !== "NO_TRADE_NEGATIVE_EDGE") {
  throw new Error("Positive directional evidence must not bypass a negative economic edge");
}
if (cases[1][1].buySellBalance.executionRoute !== "NONE") {
  throw new Error("SELL BIAS must remain research-only");
}
