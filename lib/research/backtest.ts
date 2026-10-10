import type { Candle } from "../candles";

export const RESEARCH_HORIZONS_MINUTES = [5, 15, 30] as const;
export type ResearchHorizonMinutes = (typeof RESEARCH_HORIZONS_MINUTES)[number];
export type ForecastDirection = "UP" | "DOWN" | "FLAT";

export type BacktestSample = {
  timestamp: number;
  horizonMinutes: ResearchHorizonMinutes;
  predictedDirection: ForecastDirection;
  baselineDirection: ForecastDirection;
  actualDirection: ForecastDirection;
  predictedReturnPct: number;
  actualReturnPct: number;
  grossStrategyReturnPct: number;
  netStrategyReturnPct: number;
  split: "TRAIN" | "TUNE" | "TEST";
};

export type HorizonBacktestMetrics = {
  horizonMinutes: ResearchHorizonMinutes;
  samples: number;
  trainSamples: number;
  tuneSamples: number;
  testSamples: number;
  testDirectionalAccuracy: number | null;
  testBaselineAccuracy: number | null;
  testMeanAbsoluteErrorPct: number | null;
  testBaselineMeanAbsoluteErrorPct: number | null;
  testGrossStrategyReturnPct: number | null;
  testNetStrategyReturnPct: number | null;
  testWinRate: number | null;
  costPerRoundTripPct: number;
};

export type ResearchBacktestResult = {
  generatedAt: string;
  method: "synchronized-close-momentum-v1";
  input: { bitpinCandles: number; wallexCandles: number; synchronizedCandles: number };
  split: { trainPct: 60; tunePct: 20; testPct: 20; chronological: true };
  assumptions: {
    momentumLookbackMinutes: number;
    minimumMomentumPct: number;
    flatThresholdPct: number;
    costPerRoundTripPct: number;
    outcomePrice: "Bitpin close";
    futureDataUsedForPrediction: false;
  };
  metrics: HorizonBacktestMetrics[];
  samples: BacktestSample[];
};

function finitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function direction(valuePct: number, thresholdPct: number): ForecastDirection {
  if (valuePct > thresholdPct) return "UP";
  if (valuePct < -thresholdPct) return "DOWN";
  return "FLAT";
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function accuracy(rows: BacktestSample[], key: "predictedDirection" | "baselineDirection"): number | null {
  const directionalRows = rows.filter((row) => row.actualDirection !== "FLAT");
  return directionalRows.length
    ? directionalRows.filter((row) => row[key] === row.actualDirection).length / directionalRows.length
    : null;
}

export function runResearchBacktest(
  bitpinCandles: Candle[],
  wallexCandles: Candle[],
  options: { costPerRoundTripPct?: number; minimumMomentumPct?: number; flatThresholdPct?: number } = {},
): ResearchBacktestResult {
  const costPct = options.costPerRoundTripPct ?? 0.2;
  const minimumMomentumPct = options.minimumMomentumPct ?? 0.015;
  const flatThresholdPct = options.flatThresholdPct ?? 0.02;
  if (![costPct, minimumMomentumPct, flatThresholdPct].every(Number.isFinite) || costPct < 0 || minimumMomentumPct < 0 || flatThresholdPct < 0) {
    throw new Error("Backtest parameters must be finite non-negative percentages");
  }

  const byTime = (candles: Candle[]) => {
    const map = new Map<number, Candle>();
    for (const candle of candles) {
      if (Number.isFinite(candle.time) && finitePositive(candle.close)) map.set(candle.time, candle);
    }
    return map;
  };
  const bitpin = byTime(bitpinCandles);
  const wallex = byTime(wallexCandles);
  const synchronizedTimes = [...bitpin.keys()].filter((time) => wallex.has(time)).sort((a, b) => a - b);
  const synchronized = synchronizedTimes.map((time) => ({ time, bitpin: bitpin.get(time)!, wallex: wallex.get(time)! }));
  const samples: BacktestSample[] = [];
  const lookback = 5;

  for (let index = lookback; index < synchronized.length; index += 1) {
    const current = synchronized[index];
    const past = synchronized[index - lookback];
    const previous = synchronized[index - 1];
    if (!finitePositive(current.bitpin.close) || !finitePositive(past.bitpin.close) || !finitePositive(previous.bitpin.close)) continue;

    const momentumPct = (current.bitpin.close / past.bitpin.close - 1) * 100;
    const lastCandlePct = (current.bitpin.close / previous.bitpin.close - 1) * 100;
    const predictedDirection = direction(momentumPct, minimumMomentumPct);
    const baselineDirection = direction(lastCandlePct, minimumMomentumPct);
    const predictedReturnPct = Math.abs(momentumPct) >= minimumMomentumPct ? momentumPct : 0;

    for (const horizonMinutes of RESEARCH_HORIZONS_MINUTES) {
      const futureIndex = index + horizonMinutes;
      if (futureIndex >= synchronized.length) continue;
      const futurePrice = synchronized[futureIndex].bitpin.close;
      if (!finitePositive(futurePrice)) continue;
      const actualReturnPct = (futurePrice / current.bitpin.close - 1) * 100;
      const actualDirection = direction(actualReturnPct, flatThresholdPct);
      const takesPosition = predictedDirection !== "FLAT";
      const grossStrategyReturnPct = takesPosition
        ? (predictedDirection === "UP" ? actualReturnPct : -actualReturnPct)
        : 0;
      const netStrategyReturnPct = takesPosition ? grossStrategyReturnPct - costPct : 0;
      samples.push({
        timestamp: current.time,
        horizonMinutes,
        predictedDirection,
        baselineDirection,
        actualDirection,
        predictedReturnPct,
        actualReturnPct,
        grossStrategyReturnPct,
        netStrategyReturnPct,
        split: "TRAIN",
      });
    }
  }

  const horizonMetrics = RESEARCH_HORIZONS_MINUTES.map((horizonMinutes): HorizonBacktestMetrics => {
    const chronological = samples.filter((sample) => sample.horizonMinutes === horizonMinutes).sort((a, b) => a.timestamp - b.timestamp);
    const trainEnd = Math.floor(chronological.length * 0.6);
    const tuneEnd = Math.floor(chronological.length * 0.8);
    chronological.forEach((sample, index) => {
      sample.split = index < trainEnd ? "TRAIN" : index < tuneEnd ? "TUNE" : "TEST";
    });
    const train = chronological.filter((sample) => sample.split === "TRAIN");
    const tune = chronological.filter((sample) => sample.split === "TUNE");
    const test = chronological.filter((sample) => sample.split === "TEST");
    const directionalTest = test.filter((sample) => sample.actualDirection !== "FLAT");
    return {
      horizonMinutes,
      samples: chronological.length,
      trainSamples: train.length,
      tuneSamples: tune.length,
      testSamples: test.length,
      testDirectionalAccuracy: accuracy(test, "predictedDirection"),
      testBaselineAccuracy: accuracy(test, "baselineDirection"),
      testMeanAbsoluteErrorPct: mean(test.map((sample) => Math.abs(sample.actualReturnPct - sample.predictedReturnPct))),
      testBaselineMeanAbsoluteErrorPct: mean(test.map((sample) => Math.abs(sample.actualReturnPct))),
      testGrossStrategyReturnPct: mean(test.map((sample) => sample.grossStrategyReturnPct)),
      testNetStrategyReturnPct: mean(test.map((sample) => sample.netStrategyReturnPct)),
      testWinRate: directionalTest.length ? directionalTest.filter((sample) => sample.netStrategyReturnPct > 0).length / directionalTest.length : null,
      costPerRoundTripPct: costPct,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    method: "synchronized-close-momentum-v1",
    input: { bitpinCandles: bitpinCandles.length, wallexCandles: wallexCandles.length, synchronizedCandles: synchronized.length },
    split: { trainPct: 60, tunePct: 20, testPct: 20, chronological: true },
    assumptions: {
      momentumLookbackMinutes: lookback,
      minimumMomentumPct,
      flatThresholdPct,
      costPerRoundTripPct: costPct,
      outcomePrice: "Bitpin close",
      futureDataUsedForPrediction: false,
    },
    metrics: horizonMetrics,
    samples: samples.sort((a, b) => a.timestamp - b.timestamp || a.horizonMinutes - b.horizonMinutes),
  };
}
