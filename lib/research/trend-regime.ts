import type { Candle } from "../candles";

export type TrendDirection = "BULLISH" | "BEARISH" | "RANGE" | "REVERSAL_WATCH" | "INSUFFICIENT_DATA";
export type EntryTiming = "PULLBACK_WATCH" | "BREAKOUT_CONFIRMATION" | "CONTINUATION_WATCH" | "WAIT" | "INSUFFICIENT_DATA";
export type ExitTiming = "TAKE_PROFIT_WATCH" | "STRUCTURE_WEAKENING" | "REVERSAL_RISK" | "HOLD_TREND" | "INSUFFICIENT_DATA";
type ExitSideAssessment = { status: ExitTiming; structureInvalidationPrice: number | null; reason: string };
type ExitManagement = { marketTurn: "BULLISH_REVERSAL_RISK" | "BEARISH_REVERSAL_RISK" | "MOMENTUM_WEAKENING" | "NO_REVERSAL_SIGNAL" | "INSUFFICIENT_DATA"; scoreChange5m: number | null; long: ExitSideAssessment; short: ExitSideAssessment };
type ExitBacktest = { method: string; horizonMinutes: number; testTrades: number; earlyExits: number; earlyExitRatePct: number | null; meanNetReturnWithExitPct: number | null; meanNetReturnFixedHoldPct: number | null; meanDifferenceVsFixedHoldPct: number | null; status: "EVALUATED" | "INSUFFICIENT_SAMPLE" };

type Pair = { time: number; bitpin: Candle; wallex: Candle | null };
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
  dataSource: "BITPIN_AND_WALLEX" | "BITPIN_ONLY";
  latestCandleTime: number | null;
  candleAgeSeconds: number | null;
  price: number | null;
  priceLevels: {
    support: number | null;
    resistance: number | null;
    supportDistancePct: number | null;
    resistanceDistancePct: number | null;
    breakout: "BREAKOUT_UP_CONFIRMED" | "BREAKDOWN_CONFIRMED" | "NEAR_RESISTANCE" | "NEAR_SUPPORT" | "INSIDE_RANGE" | "INSUFFICIENT_DATA";
    lookbackCandles: number;
  };
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
  exitManagement: ExitManagement;
  exitBacktest: ExitBacktest;
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

  // Trend direction is calculated from Bitpin candles. Wallex is a useful
  // cross-check, but requiring an exact Wallex match for every minute made
  // the entire trend panel unavailable when that provider stopped responding.
  return [...bitpin.keys()].sort((a, b) => a - b)
    .map((time) => ({ time, bitpin: bitpin.get(time)!, wallex: wallex.get(time) ?? null }));
}

function featureAt(pairs: Pair[], index: number): Feature | null {
  if (index < 180) return null;
  const availableLookback = Math.min(index, 360);
  const window = pairs.slice(index - availableLookback, index + 1);
  if (window.length !== availableLookback + 1 || window.some((pair, offset) => offset > 0 && pair.time - window[offset - 1].time > 300)) return null;
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


function assessExitManagement(pairs: Pair[], features: Array<Feature | null>, direction: TrendDirection, feature: Feature | null, index = pairs.length - 1): ExitManagement {
  const unavailable: ExitSideAssessment = {
    status: "INSUFFICIENT_DATA",
    structureInvalidationPrice: null,
    reason: "برای ارزیابی ریسک خروج، حداقل ۳۰ کندل بسته‌شده و دادهٔ پیوسته لازم است.",
  };
  if (!feature || index < 30 || index < 5 || !features[index - 5]) {
    return { marketTurn: "INSUFFICIENT_DATA", scoreChange5m: null, long: unavailable, short: unavailable };
  }

  const fiveMinutesAgo = features[index - 5];
  if (!fiveMinutesAgo) {
    return { marketTurn: "INSUFFICIENT_DATA", scoreChange5m: null, long: unavailable, short: unavailable };
  }
  const scoreChange5m = feature.score - fiveMinutesAgo.score;
  const price = pairs[index].bitpin.close;
  const previous = pairs.slice(index - 15, index).map((pair) => pair.bitpin);
  const recentLow = Math.min(...previous.map((candle) => candle.low));
  const recentHigh = Math.max(...previous.map((candle) => candle.high));
  // A volatility buffer reduces exits on tiny wicks. These are market-structure
  // invalidation references, not position-specific trailing stops.
  const bufferPct = Math.max(0.08, (feature.volatility60Pct * Math.sqrt(15) * 1.5));
  const buffer = price * bufferPct / 100;
  const longInvalidation = Math.max(0, recentLow - buffer);
  const shortInvalidation = recentHigh + buffer;
  const adverseForLong = feature.return15Pct <= -0.03;
  const adverseForShort = feature.return15Pct >= 0.03;
  const longBroken = price <= longInvalidation;
  const shortBroken = price >= shortInvalidation;
  // Detect a fast counter-trend turn before the slow multi-timeframe score
  // flips. Requiring feature.score to cross the opposite trend threshold here
  // would delay the warning until much of the retracement had already happened.
  const bearishTurn = adverseForLong && scoreChange5m <= -10;
  const bullishTurn = adverseForShort && scoreChange5m >= 10;
  const longReversal = bearishTurn;
  const shortReversal = bullishTurn;
  // Do not exit on score drift alone: require a counter-trend 15m move as well,
  // unless the market has already crossed the structure invalidation reference.
  const longWeakening = (adverseForLong && scoreChange5m <= -8) || longBroken;
  const shortWeakening = (adverseForShort && scoreChange5m >= 8) || shortBroken;

  const long: ExitSideAssessment = longReversal
    ? { status: "REVERSAL_RISK", structureInvalidationPrice: longInvalidation, reason: "فشار نزولی یا تغییر جهت با موقعیت لانگ تعارض دارد؛ سطح ساختاری زیر قیمت برای بررسی خروج/کاهش ریسک مشخص شده است." }
    : longWeakening
      ? { status: "STRUCTURE_WEAKENING", structureInvalidationPrice: longInvalidation, reason: "شتاب صعودی ضعیف شده یا حرکت کوتاه‌مدت علیه لانگ است؛ سطح ساختاری را زیر نظر بگیر و حد ضرر واقعی را جداگانه مدیریت کن." }
      : direction === "BULLISH"
        ? { status: "HOLD_TREND", structureInvalidationPrice: longInvalidation, reason: "فعلاً هشدار معنادار علیه لانگ دیده نمی‌شود؛ این سطح، مرجع ساختاری بازار است و حد ضرر شخصی تو نیست." }
        : { status: "TAKE_PROFIT_WATCH", structureInvalidationPrice: longInvalidation, reason: "روند فعلی از لانگ حمایت نمی‌کند؛ اگر لانگ باز داری، سود/ریسک را بازبینی کن و فقط به برچسب روند تکیه نکن." };

  const short: ExitSideAssessment = shortReversal
    ? { status: "REVERSAL_RISK", structureInvalidationPrice: shortInvalidation, reason: "فشار صعودی یا تغییر جهت با موقعیت شورت تعارض دارد؛ سطح ساختاری بالای قیمت برای بررسی خروج/کاهش ریسک مشخص شده است." }
    : shortWeakening
      ? { status: "STRUCTURE_WEAKENING", structureInvalidationPrice: shortInvalidation, reason: "شتاب نزولی ضعیف شده یا حرکت کوتاه‌مدت علیه شورت است؛ سطح ساختاری را زیر نظر بگیر و حد ضرر واقعی را جداگانه مدیریت کن." }
      : direction === "BEARISH"
        ? { status: "HOLD_TREND", structureInvalidationPrice: shortInvalidation, reason: "فعلاً هشدار معنادار علیه شورت دیده نمی‌شود؛ این سطح، مرجع ساختاری بازار است و حد ضرر شخصی تو نیست." }
        : { status: "TAKE_PROFIT_WATCH", structureInvalidationPrice: shortInvalidation, reason: "روند فعلی از شورت حمایت نمی‌کند؛ اگر شورت باز داری، سود/ریسک را بازبینی کن و فقط به برچسب روند تکیه نکن." };

  // Market-turn warnings require counter-trend momentum and score acceleration;
  // merely having the opposite side at risk is not itself a reversal signal.
  const momentumWeakening = direction === "BEARISH"
    ? shortWeakening
    : direction === "BULLISH"
      ? longWeakening
      : adverseForLong || adverseForShort || Math.abs(scoreChange5m) >= 8;
  const marketTurn = bullishTurn
    ? "BULLISH_REVERSAL_RISK" as const
    : bearishTurn
      ? "BEARISH_REVERSAL_RISK" as const
      : momentumWeakening
        ? "MOMENTUM_WEAKENING" as const
        : "NO_REVERSAL_SIGNAL" as const;
  return { marketTurn, scoreChange5m, long, short };
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


function evaluateExitBacktest(pairs: Pair[], features: Array<Feature | null>, costPct: number): ExitBacktest {
  const horizonMinutes = 60;
  const testStart = Math.floor(pairs.length * 0.8);
  let testTrades = 0;
  let earlyExits = 0;
  let managedNetTotal = 0;
  let fixedNetTotal = 0;

  // Non-overlapping entries in the chronological final-20% holdout. Exit
  // decisions use only the prefix available at that minute; outcomes are
  // compared with a fixed 60-minute hold and include the same round-trip cost.
  for (let index = Math.max(180, testStart); index + horizonMinutes < pairs.length; index += horizonMinutes) {
    const entryDirection = trendAt(features, index).direction;
    if (entryDirection !== "BULLISH" && entryDirection !== "BEARISH") continue;
    const entryPrice = pairs[index].bitpin.close;
    if (!positive(entryPrice)) continue;
    let exitIndex = index + horizonMinutes;
    let reversalStreak = 0;

    for (let cursor = index + 1; cursor <= index + horizonMinutes; cursor += 1) {
      const feature = features[cursor];
      if (!feature) {
        reversalStreak = 0;
        continue;
      }
      const currentDirection = trendAt(features, cursor).direction;
      const assessment = assessExitManagement(pairs, features, currentDirection, feature, cursor);
      const side = entryDirection === "BULLISH" ? assessment.long : assessment.short;
      const price = pairs[cursor].bitpin.close;
      const breached = side.structureInvalidationPrice != null &&
        (entryDirection === "BULLISH" ? price <= side.structureInvalidationPrice : price >= side.structureInvalidationPrice);
      reversalStreak = side.status === "REVERSAL_RISK" ? reversalStreak + 1 : 0;
      // Weakening is a warning only. The backtest exits on a persistent
      // reversal risk or a confirmed structure break, not on weakening alone.
      if (breached || reversalStreak >= 3) {
        exitIndex = cursor;
        earlyExits += 1;
        break;
      }
    }

    const exitPrice = pairs[exitIndex].bitpin.close;
    const fixedPrice = pairs[index + horizonMinutes].bitpin.close;
    if (!positive(exitPrice) || !positive(fixedPrice)) continue;
    const sign = entryDirection === "BULLISH" ? 1 : -1;
    managedNetTotal += sign * (exitPrice / entryPrice - 1) * 100 - costPct;
    fixedNetTotal += sign * (fixedPrice / entryPrice - 1) * 100 - costPct;
    testTrades += 1;
  }

  const meanNetReturnWithExitPct = testTrades ? managedNetTotal / testTrades : null;
  const meanNetReturnFixedHoldPct = testTrades ? fixedNetTotal / testTrades : null;
  const meanDifferenceVsFixedHoldPct = meanNetReturnWithExitPct != null && meanNetReturnFixedHoldPct != null
    ? meanNetReturnWithExitPct - meanNetReturnFixedHoldPct
    : null;
  return {
    method: "Chronological final-20% holdout; non-overlapping trend entries; decisions use data available at each minute; weakening is advisory only; reversal risk must persist for three closed candles unless structure breaks; compared with fixed 60-minute hold; overlapping positions excluded.",
    horizonMinutes,
    testTrades,
    earlyExits,
    earlyExitRatePct: testTrades ? earlyExits / testTrades * 100 : null,
    meanNetReturnWithExitPct,
    meanNetReturnFixedHoldPct,
    meanDifferenceVsFixedHoldPct,
    status: testTrades >= 20 ? "EVALUATED" : "INSUFFICIENT_SAMPLE",
  };
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
  const tailGap = pairs.length < 181 || pairs.slice(-181).some((pair, offset, rows) => offset > 0 && pair.time - rows[offset - 1].time > 300);
  const dataStatus = !feature || pairs.length < 181 ? "INSUFFICIENT_DATA" : stale || tailGap ? "STALE_OR_GAPPED" : "READY";
  const direction: TrendDirection = dataStatus === "READY" ? trend.direction : "INSUFFICIENT_DATA";
  const entry = entryAssessment(direction, feature, pairs);
  const exitManagement = dataStatus === "READY" ? assessExitManagement(pairs, features, direction, feature) : assessExitManagement([], [], "INSUFFICIENT_DATA", null);
  const relevantExit = direction === "BULLISH" ? exitManagement.long : direction === "BEARISH" ? exitManagement.short : null;
  const exitTiming: ExitTiming = dataStatus !== "READY" ? "INSUFFICIENT_DATA" : relevantExit?.status ?? (exitManagement.marketTurn === "BULLISH_REVERSAL_RISK" || exitManagement.marketTurn === "BEARISH_REVERSAL_RISK" ? "REVERSAL_RISK" : exitManagement.marketTurn === "MOMENTUM_WEAKENING" ? "STRUCTURE_WEAKENING" : "TAKE_PROFIT_WATCH");
  const exitReason = dataStatus !== "READY" ? "دادهٔ تازه و پیوسته کافی نیست؛ سیگنال خروج تولید نمی‌شود." : relevantExit?.reason ?? "جهت روند خنثی یا نامطمئن است؛ وضعیت پوزیشن را بر اساس قیمت ورود و ریسک واقعی بررسی کن.";
  // Use only the preceding 60 closed candles as reference levels. The latest
  // closed candle is evaluated against those levels, avoiding self-confirming
  // support/resistance calculations that include the candle being tested.
  const levelReference = pairs.slice(-61, -1).map((pair) => pair.bitpin);
  const lastClosedPrice = latest?.bitpin.close ?? null;
  const support = levelReference.length >= 30 ? Math.min(...levelReference.map((candle) => candle.low)) : null;
  const resistance = levelReference.length >= 30 ? Math.max(...levelReference.map((candle) => candle.high)) : null;
  const supportDistancePct = support != null && lastClosedPrice != null && support > 0 ? (lastClosedPrice / support - 1) * 100 : null;
  const resistanceDistancePct = resistance != null && lastClosedPrice != null && resistance > 0 ? (resistance / lastClosedPrice - 1) * 100 : null;
  const breakout = support == null || resistance == null || lastClosedPrice == null
    ? "INSUFFICIENT_DATA" as const
    : lastClosedPrice > resistance * 1.0005
      ? "BREAKOUT_UP_CONFIRMED" as const
      : lastClosedPrice < support * 0.9995
        ? "BREAKDOWN_CONFIRMED" as const
        : resistanceDistancePct != null && resistanceDistancePct >= 0 && resistanceDistancePct <= 0.15
          ? "NEAR_RESISTANCE" as const
          : supportDistancePct != null && supportDistancePct >= 0 && supportDistancePct <= 0.15
            ? "NEAR_SUPPORT" as const
            : "INSIDE_RANGE" as const;
  const priceLevels = { support, resistance, supportDistancePct, resistanceDistancePct, breakout, lookbackCandles: levelReference.length };
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
    synchronizedCandles: pairs.filter((pair) => pair.wallex !== null).length,
    dataSource: pairs.some((pair) => pair.wallex !== null) ? "BITPIN_AND_WALLEX" : "BITPIN_ONLY",
    latestCandleTime: latest?.time ?? null,
    candleAgeSeconds,
    price: latest?.bitpin.close ?? null,
    priceLevels,
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
    exitTiming,
    exitReason,
    exitManagement,
    exitBacktest: evaluateExitBacktest(pairs, features, costPct),
    regimeReason,
    backtest: {
      method: "Chronological final-20% holdout; each signal uses only candles available at its timestamp; overlapping outcomes are not compounded.",
      costPerRoundTripPct: costPct,
      futureDataUsedForPrediction: false,
      horizons: evaluateBacktest(pairs, features, costPct),
    },
  };
}
