import type { Candle } from "../candles";

export function runOpeningBacktest(candles: Candle[]) {
  return { method: "opening-event-study-v1", sessions: candles.length };
}
