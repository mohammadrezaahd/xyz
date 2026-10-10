import type { Candle } from "../candles";

export const FORECAST_HORIZONS = [5, 15, 30] as const;
export type ForecastHorizon = (typeof FORECAST_HORIZONS)[number];
export type ForecastDirection = "UP" | "DOWN" | "FLAT" | "INSUFFICIENT_DATA";

type Pair = { time: number; bitpin: Candle; wallex: Candle };
type FeatureRow = {
  time: number;
  score: number;
  momentum5Pct: number;
  momentum15Pct: number;
  momentum30Pct: number;
  volatility15Pct: number;
  venueAgreement: number;
};

export type LiveForecast = {
  horizonMinutes: ForecastHorizon;
  direction: ForecastDirection;
  score: number | null;
  historicalHitRate: number | null;
  calibrationSamples: number;
  expectedReturnPct: number | null;
  momentum5Pct: number | null;
  momentum15Pct: number | null;
  momentum30Pct: number | null;
  realizedVolatility15Pct: number | null;
  venueAgreement: number | null;
  dataStatus: "READY" | "INSUFFICIENT_DATA" | "STALE_OR_GAPPED";
  explanation: string;
};

export type ForecastResult = {
  generatedAt: string;
  model: "multi-feature-regime-v1";
  warning: string;
  synchronizedCandles: number;
  latestCandleTime: number | null;
  candleAgeSeconds: number | null;
  forecasts: LiveForecast[];
};

const finitePositive = (value: number) => Number.isFinite(value) && value > 0;

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function makePairs(bitpinCandles: Candle[], wallexCandles: Candle[]): Pair[] {
  const validMap = (candles: Candle[]) => {
    const map = new Map<number, Candle>();
    for (const candle of candles) {
      if (Number.isFinite(candle.time) && finitePositive(candle.close)) map.set(candle.time, candle);
    }
    return map;
  };
  const bitpin = validMap(bitpinCandles);
  const wallex = validMap(wallexCandles);
  return [...bitpin.keys()]
    .filter((time) => wallex.has(time))
    .sort((a, b) => a - b)
    .map((time) => ({ time, bitpin: bitpin.get(time)!, wallex: wallex.get(time)! }));
}

function featureAt(pairs: Pair[], index: number): FeatureRow | null {
  if (index < 30) return null;
  const window = pairs.slice(index - 30, index + 1);
  if (window.length !== 31 || window.some((pair, offset) => offset > 0 && pair.time - window[offset - 1].time !== 60)) return null;
  const current = pairs[index];
  const ret = (ago: number, venue: "bitpin" | "wallex") => {
    const prior = pairs[index - ago][venue].close;
    return finitePositive(prior) ? (current[venue].close / prior - 1) * 100 : null;
  };
  const m5 = ret(5, "bitpin");
  const m15 = ret(15, "bitpin");
  const m30 = ret(30, "bitpin");
  const w5 = ret(5, "wallex");
  if (m5 === null || m15 === null || m30 === null || w5 === null) return null;
  const returns: number[] = [];
  for (let offset = index - 14; offset <= index; offset += 1) {
    const previous = pairs[offset - 1].bitpin.close;
    const next = pairs[offset].bitpin.close;
    if (!finitePositive(previous) || !finitePositive(next)) return null;
    returns.push((next / previous - 1) * 100);
  }
  const volatility15Pct = returns.reduce((sum, value) => sum + Math.abs(value), 0) / returns.length;
  const venueAgreement = Math.sign(m5) === Math.sign(w5) ? 1 : -1;
  // Bounded, transparent directional score; it is not itself a probability.
  const score = Math.max(-100, Math.min(100,
    (Math.tanh(m5 / 0.04) * 0.25 +
      Math.tanh(m15 / 0.08) * 0.35 +
      Math.tanh(m30 / 0.15) * 0.25 +
      venueAgreement * 0.15) * 100,
  ));
  return { time: current.time, score, momentum5Pct: m5, momentum15Pct: m15, momentum30Pct: m30, volatility15Pct, venueAgreement };
}

function classify(score: number, threshold: number): ForecastDirection {
  if (score >= threshold) return "UP";
  if (score <= -threshold) return "DOWN";
  return "FLAT";
}

export function buildLiveForecast(
  bitpinCandles: Candle[],
  wallexCandles: Candle[],
  nowMs = Date.now(),
): ForecastResult {
  const currentMinuteStart = Math.floor(nowMs / 60_000) * 60;
  // Exclude the currently forming minute; predictions must use closed candles only.
  const pairs = makePairs(bitpinCandles, wallexCandles).filter((pair) => pair.time < currentMinuteStart);
  const latest = pairs[pairs.length - 1];
  const latestAgeSeconds = latest ? Math.max(0, Math.floor(nowMs / 1000) - (latest.time + 60)) : null;
  const gapAtTail = pairs.length < 31 || pairs.slice(-31).some((pair, offset, rows) => offset > 0 && pair.time - rows[offset - 1].time !== 60);
  const latestIndex = pairs.length - 1;
  const currentFeatures = featureAt(pairs, latestIndex);
  const forecasts = FORECAST_HORIZONS.map((horizonMinutes): LiveForecast => {
    if (!currentFeatures) {
      return {
        horizonMinutes, direction: "INSUFFICIENT_DATA", score: null,
        historicalHitRate: null, calibrationSamples: 0, expectedReturnPct: null,
        momentum5Pct: null, momentum15Pct: null, momentum30Pct: null,
        realizedVolatility15Pct: null, venueAgreement: null, dataStatus: "INSUFFICIENT_DATA",
        explanation: "At least 31 synchronized, contiguous one-minute candle pairs are required.",
      };
    }
    const historical: Array<{ score: number; actualReturnPct: number; direction: "UP" | "DOWN" | "FLAT" }> = [];
    // Only outcomes fully observable before the latest candle are used for calibration.
    for (let index = 30; index + horizonMinutes < latestIndex; index += 1) {
      const features = featureAt(pairs, index);
      if (!features) continue;
      const future = pairs[index + horizonMinutes];
      const futureWindow = pairs.slice(index, index + horizonMinutes + 1);
      if (futureWindow.length !== horizonMinutes + 1 || futureWindow.some((pair, offset) => offset > 0 && pair.time - futureWindow[offset - 1].time !== 60)) continue;
      const start = pairs[index].bitpin.close;
      const actualReturnPct = (future.bitpin.close / start - 1) * 100;
      const actualDirection = actualReturnPct > 0.02 ? "UP" : actualReturnPct < -0.02 ? "DOWN" : "FLAT";
      historical.push({ score: features.score, actualReturnPct, direction: actualDirection });
    }
    const direction = classify(currentFeatures.score, 20);
    const similar = historical.filter((row) => direction !== "FLAT" && Math.sign(row.score) === (direction === "UP" ? 1 : -1) && Math.abs(row.score) >= 20);
    const historicalHitRate = similar.length >= 30
      ? similar.filter((row) => row.direction === direction).length / similar.length
      : null;
    const expectedReturnPct = similar.length >= 30 ? median(similar.map((row) => row.actualReturnPct * (direction === "UP" ? 1 : -1))) : null;
    const dataStatus = latestAgeSeconds !== null && latestAgeSeconds > 180 ? "STALE_OR_GAPPED" : gapAtTail ? "STALE_OR_GAPPED" : "READY";
    return {
      horizonMinutes,
      direction: dataStatus === "READY" ? direction : "INSUFFICIENT_DATA",
      score: currentFeatures.score,
      historicalHitRate,
      calibrationSamples: similar.length,
      expectedReturnPct,
      momentum5Pct: currentFeatures.momentum5Pct,
      momentum15Pct: currentFeatures.momentum15Pct,
      momentum30Pct: currentFeatures.momentum30Pct,
      realizedVolatility15Pct: currentFeatures.volatility15Pct,
      venueAgreement: currentFeatures.venueAgreement,
      dataStatus,
      explanation: historicalHitRate === null
        ? "Directional score only; historical calibration needs at least 30 comparable past outcomes."
        : "Historical conditional hit rate from prior comparable signals; not a guarantee.",
    };
  });
  return {
    generatedAt: new Date(nowMs).toISOString(),
    model: "multi-feature-regime-v1",
    warning: "Research-only experimental model. A directional score is not a probability. Calibrated rates are shown only with at least 30 prior comparable outcomes. No live-trading recommendation.",
    synchronizedCandles: pairs.length,
    latestCandleTime: latest?.time ?? null,
    candleAgeSeconds: latestAgeSeconds,
    forecasts,
  };
}
