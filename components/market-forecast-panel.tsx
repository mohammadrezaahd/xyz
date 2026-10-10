"use client";

import { useCallback, useEffect, useState } from "react";

type ForecastRow = {
  horizonMinutes: number;
  direction: "UP" | "DOWN" | "FLAT" | "INSUFFICIENT_DATA";
  score: number | null;
  calibratedDirectionalRate: number | null;
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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const [forecastResponse, backtestResponse] = await Promise.all([
        fetch("/api/research/forecast", { cache: "no-store" }),
        fetch("/api/research/backtest", { cache: "no-store" }),
      ]);
      const [forecastJson, backtestJson] = await Promise.all([
        forecastResponse.json() as Promise<ForecastPayload>,
        backtestResponse.json() as Promise<BacktestPayload>,
      ]);
      if (!forecastResponse.ok || !forecastJson.ok) throw new Error(forecastJson.error ?? `Forecast API HTTP ${forecastResponse.status}`);
      setForecast(forecastJson);
      setBacktest(backtestResponse.ok && backtestJson.ok ? backtestJson : { ok: false, error: backtestJson.error ?? `Backtest API HTTP ${backtestResponse.status}` });
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
    const timer = window.setInterval(() => void load(true), 15000);
    return () => window.clearInterval(timer);
  }, [load]);

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
        <div className="forecastCardTop"><span>{item.horizonMinutes}-minute horizon</span><span className={`forecastState forecastState--${item.dataStatus.toLowerCase()}`}>{item.dataStatus.replaceAll("_", " ")}</span></div>
        <h3>{directionLabel[item.direction]}</h3>
        <div className="forecastScore"><strong>{number(item.score, 1)}</strong><span>/ 100 directional score</span></div>
        <div className="forecastMeter" role="img" aria-label={item.score == null ? "No directional score" : `Directional score ${item.score}`}><span style={{ left: `${((item.score ?? 0) + 100) / 2}%` }} /></div>
        <div className="forecastMetricRows">
          <div><span>Historical directional rate</span><strong>{rate(item.calibratedDirectionalRate)}</strong></div>
          <div><span>Comparable outcomes</span><strong>{item.calibrationSamples}</strong></div>
          <div><span>Directional return estimate</span><strong>{pct(item.expectedReturnPct)}</strong></div>
          <div><span>15m realized volatility</span><strong>{pct(item.realizedVolatility15Pct)}</strong></div>
        </div>
        <p className="forecastExplanation">{item.explanation}</p>
      </article>)}
      {!loading && !forecast?.forecasts?.length && <div className="emptyState">No forecast output is available yet.</div>}
    </section>

    <section className="forecastSection">
      <div className="sectionHeader"><div><div className="sectionEyebrow">OUT-OF-SAMPLE VALIDATION</div><h2>Historical model performance</h2></div><span className="sectionNote">Chronological holdout</span></div>
      {backtest?.metrics ? <div className="forecastTableWrap"><table className="forecastTable">
        <thead><tr><th>Horizon</th><th>Test samples</th><th>Model direction accuracy</th><th>Last-candle baseline</th><th>Mean absolute error</th><th>Net mean return</th><th>Status</th></tr></thead>
        <tbody>{backtest.metrics.map((metric) => <tr key={metric.horizonMinutes}>
          <td>{metric.horizonMinutes} min</td>
          <td>{metric.testSamples}</td>
          <td>{rate(metric.testDirectionalAccuracy)}</td>
          <td>{rate(metric.testBaselineAccuracy)}</td>
          <td>{pct(metric.testMeanAbsoluteErrorPct)}</td>
          <td>{pct(metric.testNetStrategyReturnPct)}</td>
          <td><span className={`forecastState forecastState--${metric.testSampleStatus.toLowerCase()}`}>{metric.testSampleStatus.replaceAll("_", " ")}</span></td>
        </tr>)}</tbody>
      </table></div> : <p className="forecastExplanation">{backtest?.error ?? "Loading historical validation…"}</p>}
      <p className="forecastFootnote">Accuracy is calculated only on non-flat outcomes. Net returns are a simplified directional strategy simulation using the configured round-trip cost assumption; they are not a fill-accurate portfolio backtest. A model should not be treated as validated unless it beats its baseline on adequate, representative holdout data.</p>
    </section>

    <section className="forecastSection">
      <div className="sectionEyebrow">INTERPRETATION</div>
      <div className="forecastNotes">
        <p><strong>Directional score is not probability.</strong> A score of +60 does not mean a 60% chance of a rise. The empirical rate remains hidden until at least 30 prior comparable outcomes exist for that horizon.</p>
        <p><strong>Stability is not direction.</strong> Volatility is shown separately. The next research step is to validate the existing Stability Score against future volatility and directional outcomes using point-in-time snapshots.</p>
        <p><strong>No data, no signal.</strong> Stale candles, missing contiguous windows, or insufficient history must prevent a live directional call.</p>
      </div>
    </section>
    {forecast?.warning && <p className="forecastFootnote">{forecast.warning}</p>}
    {forecast?.providerErrors && forecast.providerErrors.length > 0 && <div className="errorBanner"><strong>Provider diagnostics</strong><span>{forecast.providerErrors.join(" · ")}</span></div>}
  </div>;
}
