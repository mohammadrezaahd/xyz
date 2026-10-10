"use client";

import { useCallback, useEffect, useState } from "react";

type HorizonResult = {
  horizonMinutes: number;
  testSamples: number;
  directionalSignals: number;
  coveragePct: number | null;
  directionalAccuracyPct: number | null;
  meanNetReturnPerSignalPct: number | null;
  profitableSignalRatePct: number | null;
  status: "EVALUATED" | "INSUFFICIENT_SAMPLE";
};
type TrendPayload = {
  ok: boolean;
  error?: string;
  generatedAt?: string;
  dataStatus?: "READY" | "STALE_OR_GAPPED" | "INSUFFICIENT_DATA";
  synchronizedCandles?: number;
  candleAgeSeconds?: number | null;
  price?: number | null;
  direction?: "BULLISH" | "BEARISH" | "RANGE" | "REVERSAL_WATCH" | "INSUFFICIENT_DATA";
  rawDirection?: "BULLISH" | "BEARISH" | "RANGE";
  score?: number | null;
  persistenceVotes?: { bullish: number; bearish: number; range: number; window: number };
  momentum?: { return15Pct: number | null; return60Pct: number | null; return180Pct: number | null; return360Pct: number | null; volatility60Pct: number | null };
  structure?: "HIGHER_HIGHS_HIGHER_LOWS" | "LOWER_HIGHS_LOWER_LOWS" | "MIXED_OR_UNCONFIRMED";
  entryTiming?: "PULLBACK_WATCH" | "BREAKOUT_CONFIRMATION" | "CONTINUATION_WATCH" | "WAIT" | "INSUFFICIENT_DATA";
  entryReason?: string;
  exitTiming?: "TAKE_PROFIT_WATCH" | "STRUCTURE_WEAKENING" | "REVERSAL_RISK" | "HOLD_TREND" | "INSUFFICIENT_DATA";
  exitReason?: string;
  regimeReason?: string;
  warning?: string;
  backtest?: { costPerRoundTripPct: number; futureDataUsedForPrediction: false; horizons: HorizonResult[] };
};

const labels: Record<NonNullable<TrendPayload["direction"]>, string> = {
  BULLISH: "Main trend: Bullish",
  BEARISH: "Main trend: Bearish",
  RANGE: "Sideways market",
  REVERSAL_WATCH: "Reversal watch",
  INSUFFICIENT_DATA: "Insufficient data",
};
const entryLabels: Record<NonNullable<TrendPayload["entryTiming"]>, string> = {
  PULLBACK_WATCH: "Wait for pullback",
  BREAKOUT_CONFIRMATION: "Watch breakout confirmation",
  CONTINUATION_WATCH: "Wait for trend continuation",
  WAIT: "Wait",
  INSUFFICIENT_DATA: "Insufficient data",
};
const exitLabels: Record<NonNullable<TrendPayload["exitTiming"]>, string> = {
  TAKE_PROFIT_WATCH: "Take-profit watch",
  STRUCTURE_WEAKENING: "Trend weakening",
  REVERSAL_RISK: "Reversal risk",
  HOLD_TREND: "Trend remains intact",
  INSUFFICIENT_DATA: "Insufficient data",
};
const pct = (value: number | null | undefined, digits = 3) =>
  value == null || !Number.isFinite(value) ? "—" : `${value.toFixed(digits)}%`;
const rate = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value) ? "Insufficient samples" : `${value.toFixed(1)}%`;
const number = (value: number | null | undefined, digits = 1) =>
  value == null || !Number.isFinite(value) ? "—" : value.toLocaleString("en-US", { maximumFractionDigits: digits });

export function TrendRegimePanel({ mode = "summary" }: { mode?: "summary" | "details" | "compact" }) {
  const [data, setData] = useState<TrendPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const response = await fetch("/api/research/trend-regime", { cache: "no-store" });
      const payload = await response.json() as TrendPayload;
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? `Trend API HTTP ${response.status}`);
      setData(payload);
      setError("");
    } catch (value) {
      setError(value instanceof Error ? value.message : "Unable to load trend analysis.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const ready = data?.dataStatus === "READY";
  const direction = data?.direction ?? "INSUFFICIENT_DATA";
  const structureLabel = data?.structure === "HIGHER_HIGHS_HIGHER_LOWS"
    ? "Higher highs and higher lows"
    : data?.structure === "LOWER_HIGHS_LOWER_LOWS"
      ? "Lower highs and lower lows"
      : "Unconfirmed structure";
  const voteText = data?.persistenceVotes
    ? `Bullish votes: ${data.persistenceVotes.bullish}/${data.persistenceVotes.window} · Bearish votes: ${data.persistenceVotes.bearish}/${data.persistenceVotes.window}`
    : "Waiting for data";

  if (mode === "compact") {
    const compactLabel = direction === "BULLISH" ? "BULLISH" : direction === "BEARISH" ? "BEARISH" : direction === "RANGE" ? "SIDEWAYS" : direction === "REVERSAL_WATCH" ? "REVERSAL WATCH" : "INSUFFICIENT DATA";
    return <section className="dashboardTrend" aria-label="Market direction summary">
      <div className="dashboardTrendTitle"><span>INTRADAY TREND · 15M–6H</span><small>{refreshing ? "Updating…" : ready ? "LIVE" : "DATA CHECK"}</small></div>
      <div className={`dashboardTrendVerdict ${direction === "BULLISH" ? "isBullish" : direction === "BEARISH" ? "isBearish" : "isNeutral"}`}>{loading && !data ? "ANALYZING…" : compactLabel}</div>
      <div className="dashboardTrendFoot"><span>15m · 1h · 3h · 6h</span><button type="button" className="textLinkButton" onClick={() => window.dispatchEvent(new CustomEvent("xyz-open-forecast"))}>Forecast details ↗</button></div>
      {error && <span className="dashboardTrendError">Forecast unavailable</span>}
    </section>;
  }

  return <section className="forecastWorkspace" aria-labelledby="trend-regime-title">
    <div className="forecastHero">
      <div className="forecastHeroCopy">
        <div className="sectionEyebrow">MARKET INTELLIGENCE · PHASE 1</div>
        <h2 id="trend-regime-title">Market trend and entry timing</h2>
        <p>Trend structure and signal persistence across 15-minute to 6-hour horizons.</p>
      </div>
      <button className="refreshButton" type="button" disabled={loading || refreshing} onClick={() => void load(true)}>
        {refreshing ? "Updating…" : "Refresh"}
      </button>
    </div>

    {error && <div className="errorBanner" role="alert"><strong>Trend analysis unavailable</strong><span>{error}</span></div>}

    <section className="forecastDecision">
      <div className="forecastDecisionTop">
        <div>
          <div className="sectionEyebrow">REGIME STATUS</div>
          <h2>{loading && !data ? "Analyzing market history…" : labels[direction]}</h2>
        </div>
        <span className={`forecastVerdict ${direction === "BULLISH" ? "forecastVerdict--up" : direction === "BEARISH" ? "forecastVerdict--down" : "forecastVerdict--wait"}`}>
          {ready ? "Data ready" : data?.dataStatus === "STALE_OR_GAPPED" ? "Stale or gapped data" : "Insufficient data"}
        </span>
      </div>
      <p className="forecastDecisionLead">{data?.regimeReason ?? "Trend status is calculated from synchronized Bitpin and Wallex data."}</p>
      <small>Rule-based trend label; not a guaranteed outcome or calibrated probability.</small>
    </section>

    {mode === "details" && <section className="forecastMetaGrid" aria-label="Trend metrics">
      <div className="forecastMeta"><span>Bitpin price</span><strong>{number(data?.price, 0)}</strong></div>
      <div className="forecastMeta"><span>Directional score</span><strong>{data?.score == null ? "—" : number(data.score, 1) + " / 100"}</strong></div>
      <div className="forecastMeta"><span>Synchronized candles</span><strong>{data?.synchronizedCandles?.toLocaleString("en-US") ?? "—"}</strong></div>
      <div className="forecastMeta"><span>Latest candle age</span><strong>{data?.candleAgeSeconds == null ? "—" : `${data.candleAgeSeconds}s`}</strong></div>
    </section>}

    {mode === "details" && <section className="forecastCards" aria-label="Multi-horizon returns">
      {[
        ["15-minute return", data?.momentum?.return15Pct],
        ["60-minute return", data?.momentum?.return60Pct],
        ["3-hour return", data?.momentum?.return180Pct],
        ["6-hour return", data?.momentum?.return360Pct],
      ].map(([label, value]) => <article className="forecastCard" key={String(label)}>
        <div className="forecastCardTop"><span>{label}</span></div>
        <h3>{pct(typeof value === "number" ? value : null)}</h3>
      </article>)}
    </section>}

    <section className="timingGrid" aria-label="Entry timing and position management">
      <article className="forecastDecision">
        <div className="sectionEyebrow">ENTRY TIMING</div>
        <div className="forecastDecisionTop">
          <h2>{data?.entryTiming ? entryLabels[data.entryTiming] : "Waiting for data"}</h2>
          <span className="forecastVerdict forecastVerdict--wait">{structureLabel}</span>
        </div>
        <p>{data?.entryReason ?? "Entry timing cannot be evaluated yet."}</p>
        <small>{voteText}. Current raw direction: {data?.rawDirection === "BULLISH" ? "Bullish" : data?.rawDirection === "BEARISH" ? "Bearish" : "Sideways"}.</small>
      </article>
      <article className="forecastDecision">
        <div className="sectionEyebrow">EXIT / PROFIT MANAGEMENT</div>
        <div className="forecastDecisionTop">
          <h2>{data?.exitTiming ? exitLabels[data.exitTiming] : "Waiting for data"}</h2>
          <span className={`forecastVerdict ${data?.exitTiming === "TAKE_PROFIT_WATCH" || data?.exitTiming === "REVERSAL_RISK" ? "forecastVerdict--down" : "forecastVerdict--wait"}`}>Open position</span>
        </div>
        <p>{data?.exitReason ?? "Open-position management cannot be evaluated yet."}</p>
        <small>This is a review signal, not an exit order. It is rule-based, not a certainty.</small>
      </article>
    </section>

    {mode === "details" && <section className="chartSection" aria-labelledby="trend-backtest-title">
      <div className="sectionHeader">
        <div><div className="sectionEyebrow">CHRONOLOGICAL HOLDOUT</div><h2 id="trend-backtest-title">Historical trend validation</h2></div>
        <span className="sectionNote">Round-trip cost: {pct(data?.backtest?.costPerRoundTripPct, 2)}</span>
      </div>
      <div style={{ overflowX: "auto", padding: "0 16px 16px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700, textAlign: "left" }}>
          <thead><tr>{["Horizon", "Test samples", "Trend signals", "Coverage", "Directional accuracy", "Mean net return / signal", "Status"].map((label) => <th key={label} style={{ padding: 10, color: "var(--color-text-muted)", borderBottom: "1px solid var(--color-border)", fontSize: 11 }}>{label}</th>)}</tr></thead>
          <tbody>{(data?.backtest?.horizons ?? []).map((item) => <tr key={item.horizonMinutes}>
            <td style={{ padding: 10, borderBottom: "1px solid var(--color-border)" }}>{item.horizonMinutes} min</td>
            <td style={{ padding: 10, borderBottom: "1px solid var(--color-border)" }}>{item.testSamples.toLocaleString("en-US")}</td>
            <td style={{ padding: 10, borderBottom: "1px solid var(--color-border)" }}>{item.directionalSignals.toLocaleString("en-US")}</td>
            <td style={{ padding: 10, borderBottom: "1px solid var(--color-border)" }}>{rate(item.coveragePct)}</td>
            <td style={{ padding: 10, borderBottom: "1px solid var(--color-border)" }}>{rate(item.directionalAccuracyPct)}</td>
            <td style={{ padding: 10, borderBottom: "1px solid var(--color-border)" }}>{pct(item.meanNetReturnPerSignalPct, 4)}</td>
            <td style={{ padding: 10, borderBottom: "1px solid var(--color-border)", color: item.status === "EVALUATED" ? "var(--color-positive)" : "var(--color-warning)" }}>{item.status === "EVALUATED" ? "Sufficient sample" : "Insufficient sample"}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <p style={{ padding: "0 20px", color: "var(--color-text-muted)", fontSize: 11, lineHeight: 1.7 }}>
        The test uses the final 20% of history and only prior candles for each prediction. Samples overlap; mean net return per signal is not compounded portfolio return. Repeat across multiple periods and market regimes before drawing conclusions.
      </p>
    </section>}
  </section>;
}
