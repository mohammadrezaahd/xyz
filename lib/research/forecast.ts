import type { Candle } from "../candles";

export const FORECAST_HORIZONS = [5, 15, 30] as const;
export type ForecastHorizon = (typeof FORECAST_HORIZONS)[number];
export type ForecastDirection = "UP" | "DOWN" | "FLAT" | "INSUFFICIENT_DATA";

type Pair = { time: number; bitpin: Candle; wallex: Candle };
type FeatureRow = {
  time: number;
  score: number;
  scoresByHorizon: Record<ForecastHorizon, number>;
  momentum5Pct: number;
  momentum15Pct: number;
  momentum30Pct: number;
  volatility15Pct: number;
  venueAgreement: number;
  momentumAccelerationPct: number;
  volumePressure5Pct: number | null;
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
  momentumAccelerationPct: number | null;
  volumePressure5Pct: number | null;
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
  const bitpinSign = Math.sign(m5);
  const wallexSign = Math.sign(w5);
  // Flat/zero momentum is neutral, never agreement in the bullish direction.
  const venueAgreement = bitpinSign === 0 || wallexSign === 0 ? 0 : bitpinSign === wallexSign ? 1 : -1;
  const momentumAccelerationPct = m5 - m15 / 3;
  const volumeBaseline = median(pairs.slice(index - 30, index).map((pair) => pair.bitpin.volume ?? 0).filter((volume) => Number.isFinite(volume) && volume > 0));
  let volumeWeightedReturn = 0;
  let volumeWeightTotal = 0;
  if (volumeBaseline !== null) {
    for (let offset = index - 4; offset <= index; offset += 1) {
      const previous = pairs[offset - 1].bitpin.close;
      const candle = pairs[offset].bitpin;
      const volume = candle.volume ?? 0;
      if (!finitePositive(previous) || !finitePositive(volume)) continue;
      const relativeVolume = Math.max(0.25, Math.min(3, volume / volumeBaseline));
      const returnPct = (candle.close / previous - 1) * 100;
      volumeWeightedReturn += returnPct * relativeVolume;
      volumeWeightTotal += relativeVolume;
    }
  }
  const volumePressure5Pct = volumeWeightTotal > 0 ? volumeWeightedReturn / volumeWeightTotal : null;
  // Each horizon gets its own feature weighting. These are directional scores,
  // not probabilities; keep the live forecast and its calibration horizon-aligned.
  const scoreFor = (horizon: ForecastHorizon) => {
    const components = horizon === 5
      ? [
          { value: Math.tanh(m5 / 0.04), weight: 0.36 },
          { value: Math.tanh(momentumAccelerationPct / 0.02), weight: 0.20 },
          { value: volumePressure5Pct === null ? 0 : Math.tanh(volumePressure5Pct / 0.02), weight: volumePressure5Pct === null ? 0 : 0.18 },
          { value: venueAgreement, weight: 0.18 },
          { value: Math.tanh(m15 / 0.08), weight: 0.08 },
        ]
      : horizon === 15
        ? [
            { value: Math.tanh(m5 / 0.04), weight: 0.20 },
            { value: Math.tanh(m15 / 0.08), weight: 0.28 },
            { value: Math.tanh(m30 / 0.15), weight: 0.12 },
            { value: Math.tanh(momentumAccelerationPct / 0.02), weight: 0.12 },
            { value: venueAgreement, weight: 0.16 },
            { value: volumePressure5Pct === null ? 0 : Math.tanh(volumePressure5Pct / 0.02), weight: volumePressure5Pct === null ? 0 : 0.12 },
          ]
        : [
            { value: Math.tanh(m5 / 0.04), weight: 0.08 },
            { value: Math.tanh(m15 / 0.08), weight: 0.25 },
            { value: Math.tanh(m30 / 0.15), weight: 0.35 },
            { value: Math.tanh(momentumAccelerationPct / 0.02), weight: 0.05 },
            { value: venueAgreement, weight: 0.17 },
            { value: volumePressure5Pct === null ? 0 : Math.tanh(volumePressure5Pct / 0.02), weight: volumePressure5Pct === null ? 0 : 0.10 },
          ];
    const totalWeight = components.reduce((sum, item) => sum + item.weight, 0);
    return Math.max(-100, Math.min(100, components.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight * 100));
  };
  const scoresByHorizon: Record<ForecastHorizon, number> = { 5: scoreFor(5), 15: scoreFor(15), 30: scoreFor(30) };
  return { time: current.time, score: scoresByHorizon[15], scoresByHorizon, momentum5Pct: m5, momentum15Pct: m15, momentum30Pct: m30, volatility15Pct, venueAgreement, momentumAccelerationPct, volumePressure5Pct };
}

function classify(score: number, threshold: number): ForecastDirection {
  if (score >= threshold) return "UP";
  if (score <= -threshold) return "DOWN";
  return "FLAT";
}

export function buildForecastFeatureRows(bitpinCandles: Candle[], wallexCandles: Candle[]): FeatureRow[] {
  const pairs = makePairs(bitpinCandles, wallexCandles);
  const rows: FeatureRow[] = [];
  for (let index = 30; index < pairs.length; index += 1) {
    const row = featureAt(pairs, index);
    if (row) rows.push(row);
  }
  return rows;
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
        realizedVolatility15Pct: null, venueAgreement: null, momentumAccelerationPct: null, volumePressure5Pct: null, dataStatus: "INSUFFICIENT_DATA",
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
      historical.push({ score: features.scoresByHorizon[horizonMinutes], actualReturnPct, direction: actualDirection });
    }
    const horizonScore = currentFeatures.scoresByHorizon[horizonMinutes];
    const direction = classify(horizonScore, 20);
    const similar = historical.filter((row) => direction === "FLAT" ? Math.abs(row.score) < 20 : Math.sign(row.score) === (direction === "UP" ? 1 : -1) && Math.abs(row.score) >= 20);
    const historicalHitRate = similar.length >= 30
      ? similar.filter((row) => row.direction === direction).length / similar.length
      : null;
    const expectedReturnPct = similar.length >= 30 ? median(similar.map((row) => direction === "FLAT" ? row.actualReturnPct : row.actualReturnPct * (direction === "UP" ? 1 : -1))) : null;
    const dataStatus = latestAgeSeconds !== null && latestAgeSeconds > 180 ? "STALE_OR_GAPPED" : gapAtTail ? "STALE_OR_GAPPED" : "READY";
    return {
      horizonMinutes,
      direction: dataStatus === "READY" ? direction : "INSUFFICIENT_DATA",
      score: horizonScore,
      historicalHitRate,
      calibrationSamples: similar.length,
      expectedReturnPct,
      momentum5Pct: currentFeatures.momentum5Pct,
      momentum15Pct: currentFeatures.momentum15Pct,
      momentum30Pct: currentFeatures.momentum30Pct,
      realizedVolatility15Pct: currentFeatures.volatility15Pct,
      venueAgreement: currentFeatures.venueAgreement,
      momentumAccelerationPct: currentFeatures.momentumAccelerationPct,
      volumePressure5Pct: currentFeatures.volumePressure5Pct,
      dataStatus,
      explanation: historicalHitRate === null
        ? "Historical comparison needs at least 30 comparable past outcomes for this direction or flat regime."
        : direction === "FLAT"
          ? "Historical flat-regime match rate: the share of comparable prior outcomes that stayed within the flat-return threshold."
          : historicalHitRate < 0.5
            ? "Comparable prior signals matched this direction less than half the time; treat the directional score as weak evidence, not a trade signal."
            : "Historical same-direction hit rate from prior comparable signals; not a guarantee.",
    };
  });
  return {
    generatedAt: new Date(nowMs).toISOString(),
    model: "multi-feature-regime-v1",
    warning: "Research-only experimental model. A directional score is not a probability. Historical hit rates are shown only with at least 30 prior comparable outcomes. No live-trading recommendation.",
    synchronizedCandles: pairs.length,
    latestCandleTime: latest?.time ?? null,
    candleAgeSeconds: latestAgeSeconds,
    forecasts,
  };
}
