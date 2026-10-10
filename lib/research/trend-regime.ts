import type { Candle } from "../candles";

export type TrendDirection = "BULLISH" | "BEARISH" | "RANGE" | "REVERSAL_WATCH" | "INSUFFICIENT_DATA";
export type EntryTiming = "PULLBACK_WATCH" | "BREAKOUT_CONFIRMATION" | "CONTINUATION_WATCH" | "WAIT" | "INSUFFICIENT_DATA";
export type ExitTiming = "TAKE_PROFIT_WATCH" | "STRUCTURE_WEAKENING" | "REVERSAL_RISK" | "HOLD_TREND" | "INSUFFICIENT_DATA";

type Pair = { time: number; bitpin: Candle; wallex: Candle };
type Feature = {
  time: number;
  index: number;
  score: number;
  return15Pct: number;
  return60Pct: number;
  return180Pct: number;
  return360Pct: number | null;
  volatility60Pct: number;
  structureScore: number;
};
type BacktestHorizon = {
  horizonMinutes: number;
  testSamples: number;
  directionalSignals: number;
  coveragePct: number | null;
  directionalAccuracyPct: number | null;
  meanNetReturnPerSignalPct: number | null;
  profitableSignalRatePct: number | null;
  status: "EVALUATED" | "INSUFFICIENT_SAMPLE";
};
export type TrendRegimeResult = {
  generatedAt: string;
  model: "multi-timeframe-persistence-v1";
  warning: string;
  dataStatus: "READY" | "STALE_OR_GAPPED" | "INSUFFICIENT_DATA";
  synchronizedCandles: number;
  latestCandleTime: number | null;
  candleAgeSeconds: number | null;
  price: number | null;
  direction: TrendDirection;
  rawDirection: "BULLISH" | "BEARISH" | "RANGE";
  score: number | null;
  persistenceVotes: { bullish: number; bearish: number; range: number; window: number };
  momentum: { return15Pct: number | null; return60Pct: number | null; return180Pct: number | null; return360Pct: number | null; volatility60Pct: number | null };
  structure: "HIGHER_HIGHS_HIGHER_LOWS" | "LOWER_HIGHS_LOWER_LOWS" | "MIXED_OR_UNCONFIRMED";
  entryTiming: EntryTiming;
  entryReason: string;
  exitTiming: ExitTiming;
  exitReason: string;
  regimeReason: string;
  backtest: { method: string; costPerRoundTripPct: number; futureDataUsedForPrediction: false; horizons: BacktestHorizon[] };
};

const HORIZONS = [15, 60, 180] as const;
const COST_DEFAULT = 0.2;
const positive = (n: number) => Number.isFinite(n) && n > 0;

function pairsFor(bitpinCandles: Candle[], wallexCandles: Candle[]): Pair[] {
  const map = (candles: Candle[]) => {
    const result = new Map<number, Candle>();
    for (const candle of candles) {
      if (Number.isFinite(candle.time) && positive(candle.close)) result.set(candle.time, candle);
    }
    return result;
  };
  const bitpin = map(bitpinCandles);
  const wallex = map(wallexCandles);
  return [...bitpin.keys()].filter((time) => wallex.has(time)).sort((a, b) => a - b)
    .map((time) => ({ time, bitpin: bitpin.get(time)!, wallex: wallex.get(time)! }));
}

function featureAt(pairs: Pair[], index: number): Feature | null {
  if (index < 180) return null;
  const availableLookback = Math.min(index, 360);
  const window = pairs.slice(index - availableLookback, index + 1);
  if (window.length !== availableLookback + 1 || window.some((pair, offset) => offset > 0 && pair.time - window[offset - 1].time !== 60)) return null;
  const current = pairs[index];
  const ret = (minutes: number) => {
    const prior = pairs[index - minutes]?.bitpin.close;
    return positive(prior) ? (current.bitpin.close / prior - 1) * 100 : null;
  };
  const return15Pct = ret(15);
  const return60Pct = ret(60);
  const return180Pct = ret(180);
  const return360Pct = index >= 360 ? ret(360) : null;
  if (return15Pct === null || return60Pct === null || return180Pct === null) return null;

  const minuteReturns: number[] = [];
  for (let i = index - 59; i <= index; i += 1) {
    const prior = pairs[i - 1]?.bitpin.close;
    const next = pairs[i]?.bitpin.close;
    if (!positive(prior) || !positive(next)) return null;
    minuteReturns.push((next / prior - 1) * 100);
  }
  const volatility60Pct = Math.sqrt(minuteReturns.reduce((sum, value) => sum + value * value, 0) / minuteReturns.length);
  const horizonValues: Array<{ minutes: number; value: number; weight: number }> = [
    { minutes: 15, value: return15Pct, weight: 0.15 },
    { minutes: 60, value: return60Pct, weight: 0.25 },
    { minutes: 180, value: return180Pct, weight: 0.35 },
    ...(return360Pct === null ? [] : [{ minutes: 360, value: return360Pct, weight: 0.25 }]),
  ];
  const momentumScore = horizonValues.reduce((sum, item) => {
    const scale = Math.max(volatility60Pct * Math.sqrt(item.minutes), 0.008);
    return sum + Math.tanh((item.value / scale) / 1.6) * item.weight;
  }, 0) / horizonValues.reduce((sum, item) => sum + item.weight, 0);

  const recent = pairs.slice(index - 59, index + 1).map((pair) => pair.bitpin);
  const previous = pairs.slice(index - 119, index - 59).map((pair) => pair.bitpin);
  const recentHigh = Math.max(...recent.map((candle) => candle.high));
  const recentLow = Math.min(...recent.map((candle) => candle.low));
  const previousHigh = Math.max(...previous.map((candle) => candle.high));
  const previousLow = Math.min(...previous.map((candle) => candle.low));
  const higherHigh = recentHigh > previousHigh * 1.0001;
  const higherLow = recentLow > previousLow * 1.0001;
  const lowerHigh = recentHigh < previousHigh * 0.9999;
  const lowerLow = recentLow < previousLow * 0.9999;
  const structureScore = higherHigh && higherLow ? 1 : lowerHigh && lowerLow ? -1 : 0;
  const score = Math.max(-100, Math.min(100, (momentumScore * 0.9 + structureScore * 0.1) * 100));
  return { time: current.time, index, score, return15Pct, return60Pct, return180Pct, return360Pct, volatility60Pct, structureScore };
}

function rawDirection(score: number): "BULLISH" | "BEARISH" | "RANGE" {
  if (score >= 18) return "BULLISH";
  if (score <= -18) return "BEARISH";
  return "RANGE";
}

function trendAt(features: Array<Feature | null>, index: number): {
  direction: TrendDirection;
  rawDirection: "BULLISH" | "BEARISH" | "RANGE";
  votes: { bullish: number; bearish: number; range: number; window: number };
} {
  const feature = features[index];
  if (!feature) return { direction: "INSUFFICIENT_DATA", rawDirection: "RANGE", votes: { bullish: 0, bearish: 0, range: 0, window: 0 } };
  const recent = features.slice(Math.max(0, index - 4), index + 1).filter((item): item is Feature => item !== null);
  const counts = { bullish: 0, bearish: 0, range: 0, window: recent.length };
  for (const item of recent) {
    const direction = rawDirection(item.score);
    if (direction === "BULLISH") counts.bullish += 1;
    else if (direction === "BEARISH") counts.bearish += 1;
    else counts.range += 1;
  }
  const raw = rawDirection(feature.score);
  if (counts.bullish >= 3) return { direction: "BULLISH", rawDirection: raw, votes: counts };
  if (counts.bearish >= 3) return { direction: "BEARISH", rawDirection: raw, votes: counts };
  if (Math.abs(feature.score) >= 48 && Math.sign(feature.return180Pct) === Math.sign(feature.score)) {
    return { direction: raw, rawDirection: raw, votes: counts };
  }
  if (raw !== "RANGE" && raw !== (counts.bullish > counts.bearish ? "BULLISH" : counts.bearish > counts.bullish ? "BEARISH" : "RANGE")) {
    return { direction: "REVERSAL_WATCH", rawDirection: raw, votes: counts };
  }
  return { direction: "RANGE", rawDirection: raw, votes: counts };
}

function entryAssessment(direction: TrendDirection, feature: Feature | null, pairs: Pair[]): { entryTiming: EntryTiming; entryReason: string } {
  if (!feature || direction === "INSUFFICIENT_DATA") return { entryTiming: "INSUFFICIENT_DATA", entryReason: "برای زمان‌بندی ورود، تاریخچهٔ هم‌زمان و پیوسته کافی نیست." };
  if (direction === "REVERSAL_WATCH") return { entryTiming: "WAIT", entryReason: "نشانه‌های تغییر جهت دیده می‌شود؛ تا تأیید ساختار جدید از ورود عجولانه خودداری کن." };
  if (direction === "RANGE") return { entryTiming: "WAIT", entryReason: "بازار روند پایدار ندارد؛ ورود در محدودهٔ خنثی ریسک سیگنال‌های رفت‌وبرگشتی را بالا می‌برد." };
  const last = pairs[pairs.length - 1]?.bitpin.close ?? 0;
  const recent = pairs.slice(-31, -1).map((pair) => pair.bitpin);
  if (recent.length < 30) return { entryTiming: "INSUFFICIENT_DATA", entryReason: "برای بررسی شکست قیمت، ۳۰ کندل بسته‌شدهٔ اخیر لازم است." };
  if (direction === "BEARISH") {
    const support = Math.min(...recent.map((candle) => candle.low));
    if (feature.return15Pct > 0.025) return { entryTiming: "PULLBACK_WATCH", entryReason: "روند اصلی نزولی است اما حرکت کوتاه‌مدت در حال اصلاح صعودی است؛ منتظر ردشدن اصلاح بمان." };
    if (last < support) return { entryTiming: "BREAKOUT_CONFIRMATION", entryReason: "قیمت زیر کف ۳۰ دقیقهٔ اخیر قرار گرفته؛ شکست را با بسته‌شدن کندل و کیفیت داده تأیید کن." };
    return { entryTiming: "CONTINUATION_WATCH", entryReason: "روند نزولی هنوز برقرار است، اما شکست تازه‌ای تأیید نشده؛ دنبال ادامهٔ حرکت یا اصلاح کنترل‌شده باش." };
  }
  const resistance = Math.max(...recent.map((candle) => candle.high));
  if (feature.return15Pct < -0.025) return { entryTiming: "PULLBACK_WATCH", entryReason: "روند اصلی صعودی است اما حرکت کوتاه‌مدت اصلاح نزولی دارد؛ منتظر پایان اصلاح بمان." };
  if (last > resistance) return { entryTiming: "BREAKOUT_CONFIRMATION", entryReason: "قیمت بالای سقف ۳۰ دقیقهٔ اخیر قرار گرفته؛ شکست را با بسته‌شدن کندل و کیفیت داده تأیید کن." };
  return { entryTiming: "CONTINUATION_WATCH", entryReason: "روند صعودی برقرار است، اما شکست تازه‌ای تأیید نشده؛ از تعقیب قیمت بدون تأیید پرهیز کن." };
}

function exitAssessment(direction: TrendDirection, feature: Feature | null): { exitTiming: ExitTiming; exitReason: string } {
  if (!feature || direction === "INSUFFICIENT_DATA") {
    return { exitTiming: "INSUFFICIENT_DATA", exitReason: "دادهٔ تازه و پیوسته برای ارزیابی مدیریت موقعیت باز کافی نیست." };
  }
  if (direction === "REVERSAL_WATCH") {
    return { exitTiming: "REVERSAL_RISK", exitReason: "جهت کوتاه‌مدت با روند پایدار تعارض دارد؛ اگر موقعیت باز داری، حد ضرر و دلیل نگهداری را دوباره بررسی کن." };
  }
  if (direction === "RANGE" || Math.abs(feature.score) < 18) {
    return { exitTiming: "STRUCTURE_WEAKENING", exitReason: "روند جهت‌دار تأیید نمی‌شود؛ برای موقعیت باز، نگهداری صرفاً بر اساس جهت قبلی کافی نیست." };
  }
  const stretchThreshold = Math.max(0.04, feature.volatility60Pct * Math.sqrt(15) * 1.5);
  if (direction === "BEARISH" && feature.return15Pct <= -stretchThreshold) {
    return { exitTiming: "TAKE_PROFIT_WATCH", exitReason: "حرکت نزولی کوتاه‌مدت نسبت به نوسان اخیر کشیده شده؛ اگر موقعیت فروش باز داری، برداشت سود یا جابه‌جایی حد ضرر را بررسی کن، نه اینکه کورکورانه وارد شوی." };
  }
  if (direction === "BULLISH" && feature.return15Pct >= stretchThreshold) {
    return { exitTiming: "TAKE_PROFIT_WATCH", exitReason: "حرکت صعودی کوتاه‌مدت نسبت به نوسان اخیر کشیده شده؛ اگر موقعیت خرید باز داری، برداشت سود یا جابه‌جایی حد ضرر را بررسی کن، نه اینکه کورکورانه وارد شوی." };
  }
  return { exitTiming: "HOLD_TREND", exitReason: "فعلاً نشانهٔ کشیدگی شدید یا تضعیف واضح روند دیده نمی‌شود؛ این وضعیت تضمین نگهداری نیست و حد ضرر مستقل لازم است." };
}

function evaluateBacktest(pairs: Pair[], features: Array<Feature | null>, costPct: number) {
  return HORIZONS.map((horizonMinutes) => {
    const testStart = Math.floor(pairs.length * 0.8);
    let testSamples = 0;
    let directionalSignals = 0;
    let correct = 0;
    let profitable = 0;
    let netTotal = 0;
    for (let index = Math.max(180, testStart); index + horizonMinutes < pairs.length; index += 1) {
      if (!features[index]) continue;
      const prediction = trendAt(features, index).direction;
      const start = pairs[index].bitpin.close;
      const end = pairs[index + horizonMinutes].bitpin.close;
      if (!positive(start) || !positive(end)) continue;
      const actualReturn = (end / start - 1) * 100;
      const actualDirection = actualReturn > 0.02 ? "BULLISH" : actualReturn < -0.02 ? "BEARISH" : "RANGE";
      testSamples += 1;
      if (prediction !== "BULLISH" && prediction !== "BEARISH") continue;
      directionalSignals += 1;
      if (actualDirection !== "RANGE" && prediction === actualDirection) correct += 1;
      const gross = prediction === "BULLISH" ? actualReturn : -actualReturn;
      const net = gross - costPct;
      netTotal += net;
      if (net > 0) profitable += 1;
    }
    return {
      horizonMinutes,
      testSamples,
      directionalSignals,
      coveragePct: testSamples ? directionalSignals / testSamples * 100 : null,
      directionalAccuracyPct: directionalSignals ? correct / directionalSignals * 100 : null,
      meanNetReturnPerSignalPct: directionalSignals ? netTotal / directionalSignals : null,
      profitableSignalRatePct: directionalSignals ? profitable / directionalSignals * 100 : null,
      status: testSamples >= 100 && directionalSignals >= 30 ? "EVALUATED" as const : "INSUFFICIENT_SAMPLE" as const,
    };
  });
}

export function buildTrendRegime(
  bitpinCandles: Candle[],
  wallexCandles: Candle[],
  options: { nowMs?: number; costPerRoundTripPct?: number } = {},
): TrendRegimeResult {
  const nowMs = options.nowMs ?? Date.now();
  const costPct = options.costPerRoundTripPct ?? COST_DEFAULT;
  if (!Number.isFinite(costPct) || costPct < 0) throw new Error("Trend backtest cost must be a finite non-negative percentage");
  const currentMinuteStart = Math.floor(nowMs / 60_000) * 60;
  const pairs = pairsFor(bitpinCandles, wallexCandles).filter((pair) => pair.time < currentMinuteStart);
  const latest = pairs[pairs.length - 1] ?? null;
  const candleAgeSeconds = latest ? Math.max(0, Math.floor(nowMs / 1000) - (latest.time + 60)) : null;
  const features: Array<Feature | null> = pairs.map((_, index) => featureAt(pairs, index));
  const index = pairs.length - 1;
  const feature = features[index] ?? null;
  const trend = trendAt(features, index);
  const stale = candleAgeSeconds === null || candleAgeSeconds > 180 || !feature;
  const tailGap = pairs.length < 181 || pairs.slice(-181).some((pair, offset, rows) => offset > 0 && pair.time - rows[offset - 1].time !== 60);
  const dataStatus = !feature || pairs.length < 181 ? "INSUFFICIENT_DATA" : stale || tailGap ? "STALE_OR_GAPPED" : "READY";
  const direction: TrendDirection = dataStatus === "READY" ? trend.direction : "INSUFFICIENT_DATA";
  const entry = entryAssessment(direction, feature, pairs);
  const exit = exitAssessment(direction, feature);
  const structure = feature?.structureScore === 1 ? "HIGHER_HIGHS_HIGHER_LOWS" : feature?.structureScore === -1 ? "LOWER_HIGHS_LOWER_LOWS" : "MIXED_OR_UNCONFIRMED";
  const regimeReason = dataStatus !== "READY"
    ? "دادهٔ هم‌زمان یا پیوستهٔ تازه کافی نیست؛ وضعیت روند را فعلاً قابل اتکا نمی‌دانیم."
    : direction === "REVERSAL_WATCH"
      ? "جهت کوتاه‌مدت با روند پایدار اخیر تعارض دارد؛ تغییر روند هنوز تأیید نشده است."
      : direction === "BULLISH"
        ? "حرکت چندبازه‌ای و تداوم سیگنال از روند صعودی حمایت می‌کنند؛ این وضعیت تضمین ادامهٔ حرکت نیست."
        : direction === "BEARISH"
          ? "حرکت چندبازه‌ای و تداوم سیگنال از روند نزولی حمایت می‌کنند؛ یک اصلاح کوتاه به‌تنهایی روند را باطل نمی‌کند."
          : "شواهد روندی کافی نیستند یا جهت‌ها با هم سازگار نیستند؛ بازار را خنثی در نظر بگیر.";
  return {
    generatedAt: new Date(nowMs).toISOString(),
    model: "multi-timeframe-persistence-v1",
    warning: "Research-only. Regime labels are rules-based, not probabilities or guarantees. Backtest figures are overlapping historical signal diagnostics, not compounded portfolio returns.",
    dataStatus,
    synchronizedCandles: pairs.length,
    latestCandleTime: latest?.time ?? null,
    candleAgeSeconds,
    price: latest?.bitpin.close ?? null,
    direction,
    rawDirection: trend.rawDirection,
    score: feature?.score ?? null,
    persistenceVotes: trend.votes,
    momentum: {
      return15Pct: feature?.return15Pct ?? null,
      return60Pct: feature?.return60Pct ?? null,
      return180Pct: feature?.return180Pct ?? null,
      return360Pct: feature?.return360Pct ?? null,
      volatility60Pct: feature?.volatility60Pct ?? null,
    },
    structure,
    entryTiming: entry.entryTiming,
    entryReason: entry.entryReason,
    exitTiming: exit.exitTiming,
    exitReason: exit.exitReason,
    regimeReason,
    backtest: {
      method: "Chronological final-20% holdout; each signal uses only candles available at its timestamp; overlapping outcomes are not compounded.",
      costPerRoundTripPct: costPct,
      futureDataUsedForPrediction: false,
      horizons: evaluateBacktest(pairs, features, costPct),
    },
  };
}
