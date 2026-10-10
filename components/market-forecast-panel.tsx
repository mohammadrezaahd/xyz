"use client";

import { useCallback, useEffect, useState } from "react";

type ForecastRow = {
  horizonMinutes: number;
  direction: "UP" | "DOWN" | "FLAT" | "INSUFFICIENT_DATA";
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

type ForecastPayload = {
  ok: boolean;
  error?: string;
  warning?: string;
  model?: string;
  generatedAt?: string;
  synchronizedCandles?: number;
  candleAgeSeconds?: number | null;
  providerStatus?: Record<string, string>;
  providerErrors?: string[];
  forecasts?: ForecastRow[];
};

type BacktestMetric = {
  horizonMinutes: number;
  samples: number;
  testSamples: number;
  testSampleStatus: "INSUFFICIENT_SAMPLE" | "EVALUATED";
  testDirectionalAccuracy: number | null;
  testBaselineAccuracy: number | null;
  testMeanAbsoluteErrorPct: number | null;
  testGrossStrategyReturnPct: number | null;
  testNetStrategyReturnPct: number | null;
  testWinRate: number | null;
};

type RegimeBand = { label: string; samples: number; meanAbsoluteReturnPct: number | null; medianAbsoluteReturnPct: number | null; meanFutureRangePct: number | null; directionalMoveRate: number | null };
type RegimeHorizon = { horizonMinutes: number; matchedObservations: number; bands: RegimeBand[] };
type RegimePayload = { ok: boolean; error?: string; observationCount?: number; totalObservationCount?: number; usableObservationCount?: number; matchedObservationCount?: number; interpretation?: string; horizons?: RegimeHorizon[] };

type BacktestPayload = {
  ok: boolean;
  error?: string;
  warning?: string;
  method?: string;
  input?: { bitpinCandles: number; wallexCandles: number; synchronizedCandles: number };
  metrics?: BacktestMetric[];
  providerStatus?: Record<string, string>;
};

const pct = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? "—" : `${value.toFixed(3)}%`;
const rate = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? "Not calibrated" : `${(value * 100).toFixed(1)}%`;
const number = (value: number | null | undefined, digits = 2) => value == null || !Number.isFinite(value) ? "—" : value.toFixed(digits);
const directionLabel: Record<ForecastRow["direction"], string> = {
  UP: "Bullish",
  DOWN: "Bearish",
  FLAT: "No clear direction",
  INSUFFICIENT_DATA: "Insufficient data",
};

export function MarketForecastPanel() {
  const [forecast, setForecast] = useState<ForecastPayload | null>(null);
  const [backtest, setBacktest] = useState<BacktestPayload | null>(null);
  const [regimes, setRegimes] = useState<RegimePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const [forecastResponse, backtestResponse, regimesResponse] = await Promise.all([
        fetch("/api/research/forecast", { cache: "no-store" }),
        fetch("/api/research/backtest", { cache: "no-store" }),
        fetch("/api/research/regimes", { cache: "no-store" }),
      ]);
      const [forecastJson, backtestJson, regimesJson] = await Promise.all([
        forecastResponse.json() as Promise<ForecastPayload>,
        backtestResponse.json() as Promise<BacktestPayload>,
        regimesResponse.json() as Promise<RegimePayload>,
      ]);
      if (!forecastResponse.ok || !forecastJson.ok) throw new Error(forecastJson.error ?? `Forecast API HTTP ${forecastResponse.status}`);
      setForecast(forecastJson);
      setBacktest(backtestResponse.ok && backtestJson.ok ? backtestJson : { ok: false, error: backtestJson.error ?? `Backtest API HTTP ${backtestResponse.status}` });
      setRegimes(regimesResponse.ok && regimesJson.ok ? regimesJson : { ok: false, error: regimesJson.error ?? `Regime API HTTP ${regimesResponse.status}` });
      setError("");
    } catch (value) {
      setError(value instanceof Error ? value.message : "Unable to load forecast");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 60000);
    return () => window.clearInterval(timer);
  }, [load]);

  const forecastRows = forecast?.forecasts ?? [];
  const evaluatedMetrics = backtest?.metrics ?? [];
  const usableRows = forecastRows.filter((item) => item.dataStatus === "READY" && item.direction !== "INSUFFICIENT_DATA");
  const upCount = usableRows.filter((item) => item.direction === "UP").length;
  const downCount = usableRows.filter((item) => item.direction === "DOWN").length;
  const flatCount = usableRows.filter((item) => item.direction === "FLAT").length;
  const direction = upCount >= 2 ? "UP" : downCount >= 2 ? "DOWN" : "MIXED";
  const directionalRows = usableRows.filter((item) => item.direction === direction);
  const averageExpectedMove = directionalRows.length ? directionalRows.reduce((sum, item) => sum + Math.abs(item.expectedReturnPct ?? 0), 0) / directionalRows.length : null;
  const averageVolatility = usableRows.length ? usableRows.reduce((sum, item) => sum + Math.abs(item.realizedVolatility15Pct ?? 0), 0) / usableRows.length : null;
  const enoughComparableOutcomes = usableRows.length >= 2 && usableRows.every((item) => item.calibrationSamples >= 30 && item.historicalHitRate !== null);
  const metricsForDirection = evaluatedMetrics.filter((item) => item.testSampleStatus === "EVALUATED" && item.testSamples >= 100);
  const hasValidatedNetEdge = metricsForDirection.length >= 2 && metricsForDirection.filter((item) => (item.testNetStrategyReturnPct ?? -Infinity) > 0).length >= 2;
  const latestDataUsable = forecast?.candleAgeSeconds != null && forecast.candleAgeSeconds <= 180 && usableRows.length >= 2;
  const alignedScoresStrong = directionalRows.length >= 2 && directionalRows.filter((item) => (item.score ?? 0) * (direction === "UP" ? 1 : -1) >= 60).length >= 2;
  const historicalSupport = enoughComparableOutcomes && directionalRows.filter((item) => (item.historicalHitRate ?? 0) >= 0.5).length >= 2;
  const tradeVerdict = !latestDataUsable ? "WAIT" : direction === "MIXED" || flatCount >= 2 ? "WAIT" : alignedScoresStrong && historicalSupport && hasValidatedNetEdge ? direction : "WAIT";
  const verdictHeading = tradeVerdict === "UP" ? "خرید قابل بررسی است" : tradeVerdict === "DOWN" ? "فروش قابل بررسی است" : "فعلاً معامله نکن";
  const verdictReason = !latestDataUsable
    ? "دادهٔ تازه و هم‌جهت در افق‌های مختلف کافی نیست؛ تا رفع مشکل داده، تصمیم معاملاتی قابل اتکا نیست."
    : direction === "MIXED" || flatCount >= 2
      ? "افق‌های ۵، ۱۵ و ۳۰ دقیقه‌ای جهت روشنی ندارند یا با هم توافق نمی‌کنند؛ احتمال ورود وسط نوسان‌های بی‌جهت بالاست."
      : !enoughComparableOutcomes
        ? `جهت کوتاه‌مدت ${direction === "UP" ? "کمی صعودی" : "کمی نزولی"} است، اما نمونه‌های تاریخی قابل‌مقایسه برای تأیید آن کافی نیستند.`
        : !hasValidatedNetEdge
          ? `جهت مدل ${direction === "UP" ? "صعودی" : "نزولی"} است، اما آزمون خارج از نمونه هنوز سود خالص مثبت و قابل اتکایی بعد از هزینه‌ها نشان نمی‌دهد.`
          : !alignedScoresStrong || !historicalSupport
            ? "جهت پیش‌بینی به‌اندازهٔ کافی قوی و در داده‌های تاریخی تأییدشده نیست؛ بهتر است برای موقعیت روشن‌تر صبر کنی."
            : "چند افق زمانی هم‌جهت‌اند و آزمون تاریخی نیز از وجود برتری خالص حمایت می‌کند؛ با این حال این نتیجه تضمین سود نیست.";
  const moveVsVolatility = averageExpectedMove == null || averageVolatility == null
    ? "اندازهٔ حرکت و نوسان فعلی قابل مقایسه نیست."
    : averageExpectedMove < averageVolatility
      ? "حرکت پیش‌بینی‌شده نسبت به نوسان اخیر کوچک است؛ حتی با جهت درست هم فضای سود ممکن است برای جبران کارمزد و خطا کافی نباشد."
      : "حرکت پیش‌بینی‌شده از میانگین نوسان اخیر بزرگ‌تر است؛ با این حال باید با هزینه‌ها و اعتبار تاریخی سنجیده شود.";
  return <div className="forecastWorkspace">
    <section className="forecastHero">
      <div className="forecastHeroCopy">
        <div className="sectionEyebrow">EXPERIMENTAL FORECAST ENGINE</div>
        <h2>Market direction forecast</h2>
        <p>Multi-horizon research model using synchronized Bitpin and Wallex candle history. This is separate from the current Buy/Sell Balance indicator.</p>
      </div>
      <button className="refreshButton" type="button" disabled={loading || refreshing} onClick={() => void load(true)}>{refreshing ? "Updating…" : "Refresh forecast"}</button>
    </section>

    {error && <div className="errorBanner" role="alert"><strong>Forecast unavailable</strong><span>{error}</span></div>}

    <section className="forecastMetaGrid">
      <div className="forecastMeta"><span>Model</span><strong>{forecast?.model ?? "—"}</strong></div>
      <div className="forecastMeta"><span>Synchronized candles</span><strong>{forecast?.synchronizedCandles?.toLocaleString("en-US") ?? "—"}</strong></div>
      <div className="forecastMeta"><span>Latest candle age</span><strong>{forecast?.candleAgeSeconds == null ? "—" : `${forecast.candleAgeSeconds}s`}</strong></div>
      <div className="forecastMeta"><span>Last calculation</span><strong>{forecast?.generatedAt ? new Date(forecast.generatedAt).toLocaleTimeString("en-US") : "—"}</strong></div>
    </section>

    <section className="forecastCards" aria-label="Forecast by horizon">
      {(forecast?.forecasts ?? []).map((item) => <article className="forecastCard" key={item.horizonMinutes}>
        <div className="forecastCardTop"><span>{item.horizonMinutes}-minute horizon</span><span className={`forecastState forecastState--${item.dataStatus.toLowerCase()}`}>{item.dataStatus.replace(/_/g, " ")}</span><span className={`forecastState ${item.historicalHitRate === null ? "forecastState--insufficient_data" : item.direction !== "FLAT" && item.historicalHitRate < 0.5 ? "forecastState--weak" : "forecastState--evaluated"}`}>{item.historicalHitRate === null ? "NOT CALIBRATED" : item.direction === "FLAT" ? "FLAT REGIME MATCH" : item.historicalHitRate < 0.5 ? "WEAK HISTORICAL SUPPORT" : "HISTORICAL SUPPORT"}</span></div>
        <h3>{directionLabel[item.direction]}</h3>
        <div className="forecastScore"><strong>{number(item.score, 1)}</strong><span>/ 100 directional score</span></div>
        <div className="forecastMeter" role="img" aria-label={item.score == null ? "No directional score" : `Directional score ${item.score}`}><span style={{ left: `${((item.score ?? 0) + 100) / 2}%` }} /></div>
        <div className="forecastMetricRows">
          <div><span>Historical outcome match rate</span><strong>{rate(item.historicalHitRate)}</strong></div>
          <div><span>Comparable outcomes</span><strong>{item.calibrationSamples}</strong></div>
          <div><span>Directional return estimate</span><strong>{pct(item.expectedReturnPct)}</strong></div>
          <div><span>15m realized volatility</span><strong>{pct(item.realizedVolatility15Pct)}</strong></div>
          <div><span>5m volume-weighted pressure</span><strong>{pct(item.volumePressure5Pct)}</strong></div>
          <div><span>Momentum acceleration</span><strong>{pct(item.momentumAccelerationPct)}</strong></div>
        </div>
        <p className="forecastExplanation">{item.explanation}</p>
      </article>)}
      {!loading && !forecast?.forecasts?.length && <div className="emptyState">No forecast output is available yet.</div>}
    </section>

    <section className="forecastDecision" aria-live="polite" aria-labelledby="forecast-decision-title">
      <div className="forecastDecisionTop">
        <div><div className="sectionEyebrow">PLAIN-LANGUAGE SUMMARY</div><h2 id="forecast-decision-title">جمع‌بندی سادهٔ بازار</h2></div>
        <span className={`forecastVerdict forecastVerdict--${tradeVerdict.toLowerCase()}`}>{verdictHeading}</span>
      </div>
      {loading ? <p>در حال بررسی داده‌های بازار و نتایج آزمون تاریخی…</p> : error ? <p>فعلاً امکان جمع‌بندی مطمئن وجود ندارد: {error}</p> : <>
        <p className="forecastDecisionLead">{verdictReason}</p>
        <p>{direction === "MIXED" ? "افق‌های زمانی تصویر یکسانی ارائه نمی‌کنند." : `جهت غالب در افق‌های موجود ${direction === "UP" ? "صعودی" : direction === "DOWN" ? "نزولی" : "خنثی"} است؛ این فقط جهت احتمالی حرکت را می‌گوید، نه تضمین نتیجه.`} {moveVsVolatility}</p>
        <p>{hasValidatedNetEdge ? "آزمون تاریخیِ خارج از نمونه در چند افق سود خالص مثبت نشان می‌دهد." : "مهم‌ترین مانع، نبودِ برتری معاملاتیِ اثبات‌شده در آزمون خارج از نمونه پس از هزینه‌هاست."} {enoughComparableOutcomes ? "نمونه‌های تاریخی قابل‌مقایسه موجودند، اما باید همراه با نتیجهٔ خالص بررسی شوند." : "پشتیبانی تاریخی هنوز برای تصمیم‌گیری قوی کافی نیست."}</p>
      </>}
      <small>این جمع‌بندی خودکار از جهت افق‌ها، تازگی داده، نمونه‌های تاریخی، نوسان و بازدهٔ آزمون خارج از نمونه ساخته می‌شود. «صعودی/نزولی» به‌تنهایی به معنی خرید/فروش نیست؛ تا زمانی که مزیت خالص پس از هزینه‌ها تأیید نشود، نتیجه «عدم معامله» است.</small>
    </section>

    <section className="forecastSection">
      <div className="sectionHeader"><div><div className="sectionEyebrow">OUT-OF-SAMPLE VALIDATION</div><h2>Historical model performance</h2></div><span className="sectionNote">Chronological holdout</span></div>
      {backtest?.metrics ? <div className="forecastTableWrap"><table className="forecastTable">
        <thead><tr><th>Horizon</th><th>Test samples</th><th>Model direction accuracy</th><th>Last-candle baseline</th><th>Mean absolute error</th><th>Net strategy return</th><th>Status</th></tr></thead>
        <tbody>{backtest.metrics.map((metric) => <tr key={metric.horizonMinutes}>
          <td>{metric.horizonMinutes} min</td>
          <td>{metric.testSamples}</td>
          <td>{rate(metric.testDirectionalAccuracy)}</td>
          <td>{rate(metric.testBaselineAccuracy)}</td>
          <td>{pct(metric.testMeanAbsoluteErrorPct)}</td>
          <td>{pct(metric.testNetStrategyReturnPct)}</td>
          <td><span className={`forecastState forecastState--${metric.testSampleStatus.toLowerCase()}`}>{metric.testSampleStatus.replace(/_/g, " ")}</span></td>
        </tr>)}</tbody>
      </table></div> : <p className="forecastExplanation">{backtest?.error ?? "Loading historical validation…"}</p>}
      <p className="forecastFootnote">Accuracy is calculated only on non-flat outcomes. Net returns are a simplified directional strategy simulation using the configured round-trip cost assumption; they are not a fill-accurate portfolio backtest. A model should not be treated as validated unless it beats its baseline on adequate, representative holdout data.</p>
    </section>

    <section className="forecastSection">
      <div className="sectionHeader"><div><div className="sectionEyebrow">STABILITY REGIME RESEARCH</div><h2>Does Stability Score anticipate a quieter market?</h2></div><span className="sectionNote">{regimes?.matchedObservationCount ?? 0} matched · {regimes?.observationCount ?? 0} analyzed / {regimes?.totalObservationCount ?? 0} total</span></div>
      {regimes?.horizons ? regimes.horizons.map((horizon) => <div className="regimeHorizon" key={horizon.horizonMinutes}>
        <h3>{horizon.horizonMinutes}-minute future outcomes <span>{horizon.matchedObservations} matched observations</span></h3>
        <div className="forecastTableWrap"><table className="forecastTable">
          <thead><tr><th>Stability band</th><th>Samples</th><th>Mean absolute return</th><th>Median absolute return</th><th>Mean future high-low range</th><th>Directional move rate</th></tr></thead>
          <tbody>{horizon.bands.map((band) => <tr key={band.label}>
            <td>{band.label}</td><td>{band.samples}</td><td>{pct(band.meanAbsoluteReturnPct)}</td><td>{pct(band.medianAbsoluteReturnPct)}</td><td>{pct(band.meanFutureRangePct)}</td><td>{rate(band.directionalMoveRate)}</td>
          </tr>)}</tbody>
        </table></div>
      </div>) : <p className="forecastExplanation">{regimes?.error ?? "Waiting for stored research snapshots and matching future candles…"}</p>}
      <p className="forecastFootnote">{regimes?.interpretation ?? "Only stored point-in-time stability snapshots matched to complete future candle windows can be evaluated. Missing outcomes are excluded, not imputed."}</p>
    </section>

    <section className="forecastSection">
      <div className="sectionEyebrow">INTERPRETATION</div>
      <div className="forecastNotes">
        <p><strong>Directional score is not probability.</strong> A score of +60 does not mean a 60% chance of a rise. The historical hit rate remains hidden until at least 30 prior comparable outcomes exist for that horizon.</p>
        <p><strong>Stability is not direction.</strong> The regime table tests whether stored Stability Score bands are associated with smaller subsequent price moves and ranges; small samples are not reliable evidence.</p>
        <p><strong>No data, no signal.</strong> Stale candles, missing contiguous windows, or insufficient history must prevent a live directional call.</p>
      </div>
    </section>
    {forecast?.warning && <p className="forecastFootnote">{forecast.warning}</p>}
    {forecast?.providerErrors && forecast.providerErrors.length > 0 && <div className="errorBanner"><strong>Provider diagnostics</strong><span>{forecast.providerErrors.join(" · ")}</span></div>}
  </div>;
}
