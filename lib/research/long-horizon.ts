import type { Candle } from "../candles";

export const LONG_HORIZONS_HOURS = [24, 168] as const;
export type LongHorizonHours = (typeof LONG_HORIZONS_HOURS)[number];
export type LongDirection = "UP" | "DOWN" | "FLAT" | "INSUFFICIENT_DATA";
type Pair = { time: number; bitpin: Candle; wallex: Candle; closedAt: number; sourceTimestampOffsetSeconds: number };
type Feature = {
  time: number;
  scores: Record<LongHorizonHours, number>;
  returns: Record<24 | 168 | 720, number>;
  venueAgreement24: number;
  venueAgreement168: number;
  wallexLeadBitpinResponse168: number;
  volumePressure24: number | null;
  support: number;
  resistance: number;
  breakout: "BREAKOUT_UP_CONFIRMED" | "BREAKDOWN_CONFIRMED" | "NEAR_RESISTANCE" | "NEAR_SUPPORT" | "INSIDE_RANGE";
};

export type LongHorizonForecastRow = {
  horizonHours: LongHorizonHours;
  direction: LongDirection;
  score: number | null;
  expectedReturnPct: number | null;
  historicalHitRate: number | null;
  calibrationSamples: number;
  support: number | null;
  resistance: number | null;
  wallexLeadBitpinResponse168: number | null;
  volumePressure24Pct: number | null;
  venueAgreement: number | null;
  breakout: Feature["breakout"] | "INSUFFICIENT_DATA";
  dataStatus: "READY" | "INSUFFICIENT_DATA" | "STALE_OR_GAPPED";
};
export type LongHorizonBacktestMetric = {
  horizonHours: LongHorizonHours;
  testSamples: number;
  directionalSamples: number;
  testDirectionalAccuracy: number | null;
  baselineDirectionalAccuracy: number | null;
  meanNetReturnPerSignalPct: number | null;
  profitableSignalRatePct: number | null;
  status: "EVALUATED" | "INSUFFICIENT_SAMPLE";
};
export type LongHorizonForecastResult = {
  generatedAt: string;
  model: "hourly-multi-factor-walk-forward-v1";
  synchronizedHourlyCandles: number;
  alignmentMethod: "NEAREST_UTC_HOUR_BUCKET";
  maxSourceTimestampOffsetSeconds: number;
  candleAgeSeconds: number | null;
  dataStatus: "READY" | "INSUFFICIENT_DATA" | "STALE_OR_GAPPED";
  forecasts: LongHorizonForecastRow[];
  backtest: {
    method: string;
    costPerRoundTripPct: number;
    split: "CHRONOLOGICAL_FINAL_20_PERCENT";
    metrics: LongHorizonBacktestMetric[];
  };
};

const HOUR = 3600;
const LOOKBACK_HOURS = 720;
const SCORE_THRESHOLD = 20;
const finitePositive = (value: number) => Number.isFinite(value) && value > 0;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
function classify(score: number): Exclude<LongDirection, "INSUFFICIENT_DATA"> {
  return score >= SCORE_THRESHOLD ? "UP" : score <= -SCORE_THRESHOLD ? "DOWN" : "FLAT";
}
function actualDirection(returnPct: number): Exclude<LongDirection, "INSUFFICIENT_DATA"> {
  return returnPct > 0.15 ? "UP" : returnPct < -0.15 ? "DOWN" : "FLAT";
}
function makePairs(bitpinCandles: Candle[], wallexCandles: Candle[]): Pair[] {
  // Bitpin's hourly candles are stamped at :30 while Wallex's are stamped at :00.
  // Requiring exact UTC-hour timestamps silently discarded every Bitpin candle.
  // Match each candle to its nearest UTC-hour bucket, and retain the actual source
  // timestamps so the 30-minute inter-venue offset can be measured and disclosed.
  const toMap = (candles: Candle[]) => {
    const map = new Map<number, Candle>();
    for (const candle of candles) {
      if (!Number.isFinite(candle.time) || !finitePositive(candle.close)) continue;
      const bucket = Math.round(candle.time / HOUR) * HOUR;
      map.set(bucket, candle);
    }
    return map;
  };
  const bitpin = toMap(bitpinCandles);
  const wallex = toMap(wallexCandles);
  return [...bitpin.keys()].filter((time) => wallex.has(time)).sort((a, b) => a - b)
    .map((time) => {
      const bitpinCandle = bitpin.get(time)!;
      const wallexCandle = wallex.get(time)!;
      return {
        time,
        bitpin: bitpinCandle,
        wallex: wallexCandle,
        closedAt: Math.max(bitpinCandle.time, wallexCandle.time) + HOUR,
        sourceTimestampOffsetSeconds: Math.abs(bitpinCandle.time - wallexCandle.time),
      };
    });
}
function featureAt(pairs: Pair[], index: number): Feature | null {
  if (index < LOOKBACK_HOURS) return null;
  const window = pairs.slice(index - LOOKBACK_HOURS, index + 1);
  if (window.length !== LOOKBACK_HOURS + 1 || window.some((pair, offset) => offset > 0 && pair.time - window[offset - 1].time !== HOUR)) return null;
  const current = pairs[index];
  const returnsFor = (hours: 24 | 168 | 720, venue: "bitpin" | "wallex" = "bitpin") => {
    const prior = pairs[index - hours]?.[venue].close;
    return finitePositive(prior) ? (current[venue].close / prior - 1) * 100 : null;
  };
  const bitpin24 = returnsFor(24);
  const bitpin168 = returnsFor(168);
  const bitpin720 = returnsFor(720);
  const wallex24 = returnsFor(24, "wallex");
  const wallex168 = returnsFor(168, "wallex");
  if ([bitpin24, bitpin168, bitpin720, wallex24, wallex168].some((value) => value === null)) return null;

  const volumeBaseline = median(pairs.slice(index - 720, index).map((pair) => pair.bitpin.volume ?? 0).filter((value) => Number.isFinite(value) && value > 0));
  let pressureNumerator = 0;
  let pressureDenominator = 0;
  if (volumeBaseline !== null) {
    for (let offset = index - 23; offset <= index; offset += 1) {
      const previous = pairs[offset - 1].bitpin.close;
      const candle = pairs[offset].bitpin;
      const volume = candle.volume ?? 0;
      if (!finitePositive(previous) || !finitePositive(volume)) continue;
      const relativeVolume = clamp(volume / volumeBaseline, 0.25, 3);
      pressureNumerator += ((candle.close / previous - 1) * 100) * relativeVolume;
      pressureDenominator += relativeVolume;
    }
  }
  const volumePressure24 = pressureDenominator ? pressureNumerator / pressureDenominator : null;
  const venueAgreement24 = Math.sign(bitpin24!) === 0 || Math.sign(wallex24!) === 0 ? 0 : Math.sign(bitpin24!) === Math.sign(wallex24!) ? 1 : -1;
  const venueAgreement168 = Math.sign(bitpin168!) === 0 || Math.sign(wallex168!) === 0 ? 0 : Math.sign(bitpin168!) === Math.sign(wallex168!) ? 1 : -1;
  // Lagged cross-venue response: compare each Wallex hourly direction with
  // Bitpin's following hourly return, using only pairs that precede this row.
  let leadMatches = 0;
  let leadMismatches = 0;
  for (let offset = index - 168; offset <= index - 2; offset += 1) {
    const wallexPrior = pairs[offset].wallex.close;
    const wallexNext = pairs[offset + 1].wallex.close;
    const bitpinPrior = pairs[offset + 1].bitpin.close;
    const bitpinNext = pairs[offset + 2].bitpin.close;
    const leaderReturn = wallexNext / wallexPrior - 1;
    const responseReturn = bitpinNext / bitpinPrior - 1;
    if (Math.abs(leaderReturn) < 0.0001 || Math.abs(responseReturn) < 0.0001) continue;
    if (Math.sign(leaderReturn) === Math.sign(responseReturn)) leadMatches += 1;
    else leadMismatches += 1;
  }
  const leadResponseCount = leadMatches + leadMismatches;
  const wallexLeadBitpinResponse168 = leadResponseCount >= 30
    ? (leadMatches - leadMismatches) / leadResponseCount
    : 0;
  // Levels are calculated from the 168 hours preceding the evaluated candle.
  const levelWindow = pairs.slice(index - 168, index).map((pair) => pair.bitpin);
  const support = Math.min(...levelWindow.map((candle) => candle.low));
  const resistance = Math.max(...levelWindow.map((candle) => candle.high));
  const supportDistancePct = (current.bitpin.close / support - 1) * 100;
  const resistanceDistancePct = (resistance / current.bitpin.close - 1) * 100;
  const breakout: Feature["breakout"] = current.bitpin.close > resistance * 1.0005
    ? "BREAKOUT_UP_CONFIRMED"
    : current.bitpin.close < support * 0.9995
      ? "BREAKDOWN_CONFIRMED"
      : resistanceDistancePct >= 0 && resistanceDistancePct <= 0.3
        ? "NEAR_RESISTANCE"
        : supportDistancePct >= 0 && supportDistancePct <= 0.3
          ? "NEAR_SUPPORT"
          : "INSIDE_RANGE";
  const levelScore = breakout === "BREAKOUT_UP_CONFIRMED" ? 70
    : breakout === "BREAKDOWN_CONFIRMED" ? -70
    : breakout === "NEAR_RESISTANCE" ? -20
    : breakout === "NEAR_SUPPORT" ? 20
    : 0;
  const pressureScore = volumePressure24 === null ? 0 : Math.tanh(volumePressure24 / 0.25);
  const score24 = clamp(
    Math.tanh(bitpin24! / 0.6) * 30 +
    Math.tanh(bitpin168! / 1.5) * 12 +
    venueAgreement24 * 12 +
    pressureScore * 12 +
    wallexLeadBitpinResponse168 * 10 +
    levelScore * 0.2,
    -100, 100,
  );
  const score168 = clamp(
    Math.tanh(bitpin168! / 1.5) * 30 +
    Math.tanh(bitpin720! / 4) * 22 +
    venueAgreement168 * 17 +
    pressureScore * 5 +
    wallexLeadBitpinResponse168 * 10 +
    levelScore * 0.15,
    -100, 100,
  );
  return {
    time: current.time,
    scores: { 24: score24, 168: score168 },
    returns: { 24: bitpin24!, 168: bitpin168!, 720: bitpin720! },
    venueAgreement24,
    venueAgreement168,
    wallexLeadBitpinResponse168,
    volumePressure24,
    support,
    resistance,
    breakout,
  };
}

type Outcome = { index: number; horizonHours: LongHorizonHours; score: number; predicted: Exclude<LongDirection, "INSUFFICIENT_DATA">; actual: Exclude<LongDirection, "INSUFFICIENT_DATA">; returnPct: number; baseline: Exclude<LongDirection, "INSUFFICIENT_DATA"> };
function allOutcomes(pairs: Pair[], features: Array<Feature | null>): Outcome[] {
  const outcomes: Outcome[] = [];
  for (let index = LOOKBACK_HOURS; index < pairs.length; index += 1) {
    const feature = features[index];
    if (!feature) continue;
    for (const horizonHours of LONG_HORIZONS_HOURS) {
      const futureIndex = index + horizonHours;
      if (futureIndex >= pairs.length) continue;
      const futureWindow = pairs.slice(index, futureIndex + 1);
      if (futureWindow.length !== horizonHours + 1 || futureWindow.some((pair, offset) => offset > 0 && pair.time - futureWindow[offset - 1].time !== HOUR)) continue;
      const start = pairs[index].bitpin.close;
      const end = pairs[futureIndex].bitpin.close;
      if (!finitePositive(start) || !finitePositive(end)) continue;
      const returnPct = (end / start - 1) * 100;
      const baseline = actualDirection(feature.returns[horizonHours === 24 ? 24 : 168]);
      outcomes.push({ index, horizonHours, score: feature.scores[horizonHours], predicted: classify(feature.scores[horizonHours]), actual: actualDirection(returnPct), returnPct, baseline });
    }
  }
  return outcomes;
}

function backtest(pairs: Pair[], outcomes: Outcome[], costPerRoundTripPct: number): LongHorizonBacktestMetric[] {
  return LONG_HORIZONS_HOURS.map((horizonHours) => {
    const rows = outcomes.filter((row) => row.horizonHours === horizonHours);
    const testStart = Math.floor(pairs.length * 0.8);
    const test = rows.filter((row) => row.index >= testStart);
    const directional = test.filter((row) => row.predicted !== "FLAT" && row.actual !== "FLAT");
    const correct = directional.filter((row) => row.predicted === row.actual).length;
    const baselineDirectional = test.filter((row) => row.baseline !== "FLAT" && row.actual !== "FLAT");
    const baselineCorrect = baselineDirectional.filter((row) => row.baseline === row.actual).length;
    const trades = test.filter((row) => row.predicted !== "FLAT");
    const net = trades.map((row) => (row.predicted === "UP" ? row.returnPct : -row.returnPct) - costPerRoundTripPct);
    return {
      horizonHours,
      testSamples: test.length,
      directionalSamples: directional.length,
      testDirectionalAccuracy: directional.length ? correct / directional.length : null,
      baselineDirectionalAccuracy: baselineDirectional.length ? baselineCorrect / baselineDirectional.length : null,
      meanNetReturnPerSignalPct: net.length ? net.reduce((sum, value) => sum + value, 0) / net.length : null,
      profitableSignalRatePct: net.length ? net.filter((value) => value > 0).length / net.length * 100 : null,
      status: test.length >= 100 && directional.length >= 30 ? "EVALUATED" as const : "INSUFFICIENT_SAMPLE" as const,
    };
  });
}

export function buildLongHorizonForecast(
  bitpinCandles: Candle[],
  wallexCandles: Candle[],
  options: { nowMs?: number; costPerRoundTripPct?: number } = {},
): LongHorizonForecastResult {
  const nowMs = options.nowMs ?? Date.now();
  const costPerRoundTripPct = options.costPerRoundTripPct ?? 0.2;
  if (!Number.isFinite(costPerRoundTripPct) || costPerRoundTripPct < 0) throw new Error("Backtest cost must be finite and non-negative");
  const nowSeconds = Math.floor(nowMs / 1000);
  const pairs = makePairs(bitpinCandles, wallexCandles).filter((pair) => pair.closedAt <= nowSeconds);
  const latest = pairs[pairs.length - 1] ?? null;
  const candleAgeSeconds = latest ? Math.max(0, nowSeconds - latest.closedAt) : null;
  const maxSourceTimestampOffsetSeconds = pairs.reduce((max, pair) => Math.max(max, pair.sourceTimestampOffsetSeconds), 0);
  const features: Array<Feature | null> = pairs.map((_, index) => featureAt(pairs, index));
  const latestIndex = pairs.length - 1;
  const current = features[latestIndex] ?? null;
  const outcomes = allOutcomes(pairs, features);
  const tailGap = pairs.length < LOOKBACK_HOURS + 1 || pairs.slice(-LOOKBACK_HOURS - 1).some((pair, offset, rows) => offset > 0 && pair.time - rows[offset - 1].time !== HOUR);
  const stale = candleAgeSeconds === null || candleAgeSeconds > 3 * HOUR;
  const dataStatus = !current ? "INSUFFICIENT_DATA" : stale || tailGap ? "STALE_OR_GAPPED" : "READY";
  const forecasts = LONG_HORIZONS_HOURS.map((horizonHours): LongHorizonForecastRow => {
    if (!current || dataStatus !== "READY") return {
      horizonHours, direction: "INSUFFICIENT_DATA", score: null, expectedReturnPct: null,
      historicalHitRate: null, calibrationSamples: 0, support: current?.support ?? null,
      resistance: current?.resistance ?? null,
      wallexLeadBitpinResponse168: current?.wallexLeadBitpinResponse168 ?? null,
      volumePressure24Pct: current?.volumePressure24 ?? null,
      venueAgreement: current ? (horizonHours === 24 ? current.venueAgreement24 : current.venueAgreement168) : null,
      breakout: current?.breakout ?? "INSUFFICIENT_DATA",
      dataStatus: dataStatus === "READY" ? "INSUFFICIENT_DATA" : dataStatus,
    };
    const direction = classify(current.scores[horizonHours]);
    const comparable = outcomes.filter((row) => row.horizonHours === horizonHours && row.index + horizonHours < latestIndex &&
      (direction === "FLAT" ? row.predicted === "FLAT" : row.predicted === direction));
    const returns = comparable.map((row) => row.returnPct);
    return {
      horizonHours,
      direction,
      score: current.scores[horizonHours],
      expectedReturnPct: comparable.length >= 30 ? median(returns) : null,
      historicalHitRate: comparable.length >= 30 ? comparable.filter((row) => row.actual === direction).length / comparable.length : null,
      calibrationSamples: comparable.length,
      support: current.support,
      resistance: current.resistance,
      wallexLeadBitpinResponse168: current.wallexLeadBitpinResponse168,
      volumePressure24Pct: current.volumePressure24,
      venueAgreement: horizonHours === 24 ? current.venueAgreement24 : current.venueAgreement168,
      breakout: current.breakout,
      dataStatus: "READY",
    };
  });
  return {
    generatedAt: new Date(nowMs).toISOString(),
    model: "hourly-multi-factor-walk-forward-v1",
    synchronizedHourlyCandles: pairs.length,
    alignmentMethod: "NEAREST_UTC_HOUR_BUCKET",
    maxSourceTimestampOffsetSeconds,
    candleAgeSeconds,
    dataStatus,
    forecasts,
    backtest: {
      method: "Fixed, predeclared multi-factor rules; predictions use only the prior 720 synchronized closed hourly candles. Metrics use a chronological final-20% holdout and are descriptive because horizon outcomes overlap.",
      costPerRoundTripPct,
      split: "CHRONOLOGICAL_FINAL_20_PERCENT",
      metrics: backtest(pairs, outcomes, costPerRoundTripPct),
    },
  };
}
