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
  UP: "BULLISH BIAS",
  DOWN: "BEARISH BIAS",
  FLAT: "NEUTRAL / WAIT",
  INSUFFICIENT_DATA: "NO SIGNAL",
};

export function MarketForecastPanel({ mode = "summary" }: { mode?: "summary" | "details" | "compact" }) {
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
  const usableRows = forecastRows.filter((item) => item.dataStatus === "READY" && item.direction !== "INSUFFICIENT_DATA");
  const upCount = usableRows.filter((item) => item.direction === "UP").length;
  const downCount = usableRows.filter((item) => item.direction === "DOWN").length;
  const direction = upCount >= 2 && upCount > downCount ? "UP" : downCount >= 2 && downCount > upCount ? "DOWN" : "MIXED";
  const directionalRows = usableRows.filter((item) => item.direction === direction);
  const freshAndAligned = forecast?.candleAgeSeconds != null && forecast.candleAgeSeconds <= 180 && usableRows.length >= 2 && direction !== "MIXED";
  const enoughComparableOutcomes = directionalRows.length >= 2 && directionalRows.every((item) => item.calibrationSamples >= 30 && item.historicalHitRate !== null);
  const historicalSupport = directionalRows.filter((item) => item.historicalHitRate != null && item.historicalHitRate >= 0.5).length >= 2;
  const signedReturnSupport = directionalRows.filter((item) => item.expectedReturnPct != null && (direction === "UP" ? item.expectedReturnPct > 0 : item.expectedReturnPct < 0)).length >= 2;
  const evaluatedBacktests = (backtest?.metrics ?? []).filter((item) => item.testSampleStatus === "EVALUATED" && item.testSamples >= 100);
  const validatedEdge = evaluatedBacktests.filter((item) => item.testNetStrategyReturnPct != null && item.testNetStrategyReturnPct > 0 && item.testDirectionalAccuracy != null && item.testBaselineAccuracy != null && item.testDirectionalAccuracy > item.testBaselineAccuracy).length >= 2;
  const forecastCanSupportTrade = Boolean(freshAndAligned && enoughComparableOutcomes && historicalSupport && signedReturnSupport && validatedEdge);
  const forecastDirectionLabel = direction === "UP" ? "BULLISH CONSENSUS" : direction === "DOWN" ? "BEARISH CONSENSUS" : "MIXED / NO CONSENSUS";
  const summaryReason = !freshAndAligned
    ? "Fresh data and a clear majority across time horizons are required."
    : !enoughComparableOutcomes
      ? "There are not enough comparable historical outcomes to confirm this direction."
      : !historicalSupport
        ? "Historical direction-match rates do not support the current bias."
        : !signedReturnSupport
          ? "The signed expected-return estimate does not agree with the forecast direction."
          : !validatedEdge
            ? "Out-of-sample testing has not established a positive net edge over the baseline."
            : "Historical alignment and after-cost out-of-sample results support further review, not a guaranteed trade.";

  if (mode === "compact") {
    return <section className="signalStrip" aria-label="Short-term market signals">
      <div className="signalStripHeader"><h2>Short-term signals</h2><span>{refreshing ? "Updating…" : loading ? "Loading…" : forecast?.generatedAt ? `Updated ${new Date(forecast.generatedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}` : "Waiting for data"}</span></div>
      <div className="signalStripGrid">
        {[5, 15, 30, 60].map((horizon) => {
          const item = forecastRows.find((row) => row.horizonMinutes === horizon);
          const label = horizon === 60 ? "1 HOUR" : `${horizon} MIN`;
          const directionClass = !item || item.direction === "INSUFFICIENT_DATA" ? "unknown" : item.direction === "UP" ? "bullish" : item.direction === "DOWN" ? "bearish" : "neutral";
          return <article className={`signalStripCard signalStripCard--${directionClass}`} key={horizon}>
            <span className="signalStripHorizon">{label}</span>
            <strong>{item ? directionLabel[item.direction] : loading ? "ANALYZING…" : "NO SIGNAL"}</strong>
            <small>{item?.score == null ? "Score —" : `Score ${item.score > 0 ? "+" : ""}${item.score.toFixed(0)}`}</small>
          </article>;
        })}
      </div>
      <button type="button" className="textLinkButton signalStripLink" onClick={() => window.dispatchEvent(new CustomEvent("xyz-open-forecast"))}>All signals &amp; validation ↗</button>
    </section>;
  }

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

    {mode === "summary" && <section className="forecastDecision forecastTakeaway" aria-live="polite">
      <div className="sectionEyebrow">FORECAST TAKEAWAY</div>
      <div className="forecastDecisionTop"><h2>{forecastDirectionLabel}</h2><span className={`forecastVerdict ${forecastCanSupportTrade ? "forecastVerdict--up" : "forecastVerdict--down"}`}>{forecastCanSupportTrade ? "TRADE GATE PASSED" : "NOT TRADE-VALIDATED"}</span></div>
      <p>{summaryReason}</p>
      <small>جهت مدل پیش‌بینی است، نه احتمال موفقیت. تا وقتی برتری خارج از نمونه پس از هزینه‌ها تأیید نشده، نتیجه «عدم معامله» است.</small>
    </section>}

    {mode === "details" && <section className="forecastMetaGrid">
      <div className="forecastMeta"><span>Model</span><strong>{forecast?.model ?? "—"}</strong></div>
      <div className="forecastMeta"><span>Synchronized candles</span><strong>{forecast?.synchronizedCandles?.toLocaleString("en-US") ?? "—"}</strong></div>
      <div className="forecastMeta"><span>Latest candle age</span><strong>{forecast?.candleAgeSeconds == null ? "—" : `${forecast.candleAgeSeconds}s`}</strong></div>
      <div className="forecastMeta"><span>Last calculation</span><strong>{forecast?.generatedAt ? new Date(forecast.generatedAt).toLocaleTimeString("en-US") : "—"}</strong></div>
    </section>}

    <section className={`forecastCards forecastCards--${mode}`} aria-label="Forecast by horizon">
      {(forecast?.forecasts ?? []).map((item) => <article className="forecastCard" key={item.horizonMinutes}>
        <div className="forecastCardTop"><span>{item.horizonMinutes === 60 ? "1-hour forecast" : `${item.horizonMinutes}-minute forecast`}</span>{mode === "details" && <><span className={`forecastState forecastState--${item.dataStatus.toLowerCase()}`}>{item.dataStatus.replace(/_/g, " ")}</span><span className={`forecastState ${item.historicalHitRate === null ? "forecastState--insufficient_data" : item.direction !== "FLAT" && item.historicalHitRate < 0.5 ? "forecastState--weak" : "forecastState--evaluated"}`}>{item.historicalHitRate === null ? "NOT CALIBRATED" : item.direction === "FLAT" ? "FLAT REGIME MATCH" : item.historicalHitRate < 0.5 ? "WEAK HISTORICAL SUPPORT" : "HISTORICAL SUPPORT"}</span></>}</div>
        <h3>{directionLabel[item.direction]}</h3>
        <div className="forecastScore"><strong>{number(item.score, 1)}</strong><span>/ 100 directional score</span></div>
         {mode === "summary" && <div className={`signalCardGate ${item.dataStatus !== "READY" || item.direction === "INSUFFICIENT_DATA" || item.calibrationSamples < 30 || item.historicalHitRate === null ? "signalCardGate--wait" : item.historicalHitRate >= 0.5 ? "signalCardGate--review" : "signalCardGate--weak"}`}>{item.dataStatus !== "READY" || item.direction === "INSUFFICIENT_DATA" ? "NO SIGNAL · DATA ISSUE" : item.calibrationSamples < 30 || item.historicalHitRate === null ? "BIAS ONLY · NOT CALIBRATED" : item.historicalHitRate >= 0.5 ? "HISTORICAL SUPPORT · REVIEW" : "WEAK HISTORICAL SUPPORT"}</div>}
         {mode === "summary" && <div className="forecastSummaryStats"><div><span>Historical match</span><strong>{rate(item.historicalHitRate)}</strong></div><div><span>Expected move</span><strong>{pct(item.expectedReturnPct)}</strong></div><div><span>Comparable signals</span><strong>{item.calibrationSamples}</strong></div></div>}
        <div className="forecastMeter" role="img" aria-label={item.score == null ? "No directional score" : `Directional score ${item.score}`}><span style={{ left: `${((item.score ?? 0) + 100) / 2}%` }} /></div>
        {mode === "details" ? <div className="forecastMetricRows">
          <div><span>Historical outcome match rate</span><strong>{rate(item.historicalHitRate)}</strong></div>
          <div><span>Comparable outcomes</span><strong>{item.calibrationSamples}</strong></div>
          <div><span>Expected price return (signed)</span><strong>{pct(item.expectedReturnPct)}</strong></div>
          <div><span>15m realized volatility</span><strong>{pct(item.realizedVolatility15Pct)}</strong></div>
          <div><span>5m volume-weighted pressure</span><strong>{pct(item.volumePressure5Pct)}</strong></div>
          <div><span>Momentum acceleration</span><strong>{pct(item.momentumAccelerationPct)}</strong></div>
        </div> : <div className="forecastSummaryStats"><div><span>Historical match</span><strong>{rate(item.historicalHitRate)}</strong></div><div><span>Expected move</span><strong>{pct(item.expectedReturnPct)}</strong></div><div><span>Comparable signals</span><strong>{item.calibrationSamples}</strong></div></div>}
        {mode === "details" && <p className="forecastExplanation">{item.explanation}</p>}
      </article>)}
      {!loading && !forecast?.forecasts?.length && <div className="emptyState">No forecast output is available yet.</div>}
    </section>

    {mode === "details" && <section className="forecastSection">
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
    </section>}

    {mode === "details" && <section className="forecastSection">
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
    </section>}

    {mode === "details" && <section className="forecastSection">
      <div className="sectionEyebrow">INTERPRETATION</div>
      <div className="forecastNotes">
        <p><strong>Directional score is not probability.</strong> A score of +60 does not mean a 60% chance of a rise. The historical hit rate remains hidden until at least 30 prior comparable outcomes exist for that horizon.</p>
        <p><strong>Stability is not direction.</strong> The regime table tests whether stored Stability Score bands are associated with smaller subsequent price moves and ranges; small samples are not reliable evidence.</p>
        <p><strong>No data, no signal.</strong> Stale candles, missing contiguous windows, or insufficient history must prevent a live directional call.</p>
      </div>
    </section>}
    {mode === "details" && forecast?.warning && <p className="forecastFootnote">{forecast.warning}</p>}
    {mode === "details" && forecast?.providerErrors && forecast.providerErrors.length > 0 && <div className="errorBanner"><strong>Provider diagnostics</strong><span>{forecast.providerErrors.join(" · ")}</span></div>}
  </div>;
}
