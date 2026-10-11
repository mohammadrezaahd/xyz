"use client";

import { useMemo } from "react";
import type { Candle } from "@/lib/candles";
import { buildLongHorizonForecast } from "@/lib/research/long-horizon";

const formatPrice = (value: number | null) => value == null || !Number.isFinite(value) ? "—" : Math.round(value).toLocaleString("en-US");
const formatPct = (value: number | null) => value == null || !Number.isFinite(value) ? "Not calibrated" : `${value >= 0 ? "+" : ""}${value.toFixed(3)}%`;
const formatRate = (value: number | null) => value == null || !Number.isFinite(value) ? "Insufficient samples" : `${(value * 100).toFixed(1)}%`;
const directionText = (direction: string) => direction === "UP" ? "BULLISH" : direction === "DOWN" ? "BEARISH" : direction === "FLAT" ? "NEUTRAL" : "INSUFFICIENT DATA";
const directionColor = (direction: string) => direction === "UP" ? "#35c98a" : direction === "DOWN" ? "#ff858b" : direction === "FLAT" ? "#fbbf24" : "#94a3b8";

export function WeeklyAnalysisPanel({ bitpin, wallex }: { bitpin: Candle[]; wallex: Candle[] }) {
  const result = useMemo(() => buildLongHorizonForecast(bitpin, wallex), [bitpin, wallex]);
  const label = result.dataStatus === "READY" ? "LIVE · HOURLY DATA" : result.dataStatus.replaceAll("_", " ");

  return (
    <section style={{ border: "1px solid rgba(148,163,184,.18)", borderRadius: 12, padding: 16, background: "rgba(15,23,42,.5)", marginTop: 16, color: "#e2e8f0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ color: "#7dd3fc", fontSize: 11, letterSpacing: 1.2, fontWeight: 700 }}>MULTI-FACTOR FORWARD FORECAST</div>
          <h2 style={{ fontSize: 18, margin: "5px 0" }}>24-hour and 7-day market forecast</h2>
          <p style={{ color: "#94a3b8", fontSize: 12, margin: 0 }}>Synchronized Bitpin/Wallex hourly candles · trend · venue agreement · volume pressure · support/resistance</p>
        </div>
        <span style={{ color: result.dataStatus === "READY" ? "#35c98a" : "#fbbf24", fontSize: 11 }}>{label}</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 12, marginTop: 14 }}>
        {result.forecasts.map((item) => (
          <article key={item.horizonHours} style={{ border: "1px solid rgba(148,163,184,.18)", borderRadius: 10, padding: 14, background: "rgba(15,23,42,.35)", minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span style={{ color: "#94a3b8", fontSize: 11 }}>{item.horizonHours === 24 ? "NEXT 24 HOURS" : "NEXT 7 DAYS"}</span>
              <span style={{ color: item.dataStatus === "READY" ? "#35c98a" : "#fbbf24", fontSize: 10 }}>{item.dataStatus.replaceAll("_", " ")}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginTop: 10 }}>
              <strong style={{ color: directionColor(item.direction), fontSize: 20 }}>{directionText(item.direction)}</strong>
              <span style={{ color: "#cbd5e1", fontSize: 12 }}>{item.score == null ? "Score —" : `Score ${item.score > 0 ? "+" : ""}${item.score.toFixed(1)}/100`}</span>
            </div>
            <div style={{ height: 5, borderRadius: 8, background: "rgba(148,163,184,.15)", overflow: "hidden", marginTop: 10 }}>
              <div style={{ width: `${Math.abs(item.score ?? 0)}%`, marginLeft: item.score != null && item.score < 0 ? `${100 - Math.abs(item.score)}%` : "0", height: "100%", background: directionColor(item.direction) }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
              <div><div style={{ color: "#94a3b8", fontSize: 10 }}>Historical hit rate</div><strong style={{ display: "block", marginTop: 4, fontSize: 13 }}>{formatRate(item.historicalHitRate)}</strong></div>
              <div><div style={{ color: "#94a3b8", fontSize: 10 }}>Median comparable return</div><strong style={{ display: "block", marginTop: 4, fontSize: 13 }}>{formatPct(item.expectedReturnPct)}</strong></div>
              <div><div style={{ color: "#94a3b8", fontSize: 10 }}>Prior support</div><strong style={{ display: "block", marginTop: 4, fontSize: 12 }}>{formatPrice(item.support)}</strong></div>
              <div><div style={{ color: "#94a3b8", fontSize: 10 }}>Prior resistance</div><strong style={{ display: "block", marginTop: 4, fontSize: 12 }}>{formatPrice(item.resistance)}</strong></div>
              <div><div style={{ color: "#94a3b8", fontSize: 10 }}>Wallex → Bitpin response</div><strong style={{ display: "block", marginTop: 4, fontSize: 12 }}>{item.wallexLeadBitpinResponse168 == null ? "—" : `${(item.wallexLeadBitpinResponse168 * 100).toFixed(1)}%`}</strong></div>
              <div><div style={{ color: "#94a3b8", fontSize: 10 }}>24h volume pressure</div><strong style={{ display: "block", marginTop: 4, fontSize: 12 }}>{formatPct(item.volumePressure24Pct)}</strong></div>
            </div>
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(148,163,184,.14)", color: "#cbd5e1", fontSize: 11, lineHeight: 1.6 }}>
              Structure: <strong>{item.breakout.replaceAll("_", " ")}</strong><br />
              Comparable historical outcomes: <strong>{item.calibrationSamples}</strong>
            </div>
          </article>
        ))}
      </div>

      <section style={{ marginTop: 16, border: "1px solid rgba(148,163,184,.14)", borderRadius: 10, padding: 13 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <strong style={{ fontSize: 13 }}>Chronological holdout backtest</strong>
          <span style={{ color: "#94a3b8", fontSize: 10 }}>Final 20% of history · ${result.backtest.costPerRoundTripPct.toFixed(3)}% round-trip cost</span>
        </div>
        <div style={{ overflowX: "auto", marginTop: 10 }}>
          <table style={{ width: "100%", minWidth: 600, borderCollapse: "collapse", fontSize: 11, textAlign: "left" }}>
            <thead><tr>{["Horizon", "Test samples", "Directional accuracy", "Momentum baseline", "Net return / signal", "Profitable signals", "Status"].map((label) => <th key={label} style={{ color: "#94a3b8", padding: "9px 7px", borderBottom: "1px solid rgba(148,163,184,.14)", fontWeight: 600 }}>{label}</th>)}</tr></thead>
            <tbody>{result.backtest.metrics.map((metric) => <tr key={metric.horizonHours}>
              <td style={{ padding: "9px 7px", borderBottom: "1px solid rgba(148,163,184,.08)" }}>{metric.horizonHours === 24 ? "24h" : "7d"}</td>
              <td style={{ padding: "9px 7px", borderBottom: "1px solid rgba(148,163,184,.08)" }}>{metric.testSamples}</td>
              <td style={{ padding: "9px 7px", borderBottom: "1px solid rgba(148,163,184,.08)" }}>{metric.testDirectionalAccuracy == null ? "—" : `${(metric.testDirectionalAccuracy * 100).toFixed(1)}%`}</td>
              <td style={{ padding: "9px 7px", borderBottom: "1px solid rgba(148,163,184,.08)" }}>{metric.baselineDirectionalAccuracy == null ? "—" : `${(metric.baselineDirectionalAccuracy * 100).toFixed(1)}%`}</td>
              <td style={{ padding: "9px 7px", borderBottom: "1px solid rgba(148,163,184,.08)", color: metric.meanNetReturnPerSignalPct != null && metric.meanNetReturnPerSignalPct > 0 ? "#35c98a" : "#ff858b" }}>{formatPct(metric.meanNetReturnPerSignalPct)}</td>
              <td style={{ padding: "9px 7px", borderBottom: "1px solid rgba(148,163,184,.08)" }}>{metric.profitableSignalRatePct == null ? "—" : `${metric.profitableSignalRatePct.toFixed(1)}%`}</td>
              <td style={{ padding: "9px 7px", borderBottom: "1px solid rgba(148,163,184,.08)", color: metric.status === "EVALUATED" ? "#35c98a" : "#fbbf24" }}>{metric.status.replaceAll("_", " ")}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>
      <p style={{ color: "#94a3b8", fontSize: 11, lineHeight: 1.65, marginBottom: 0, marginTop: 12 }}>
        Forecasts are forward-looking rule-based estimates, not probabilities of profit. The backtest uses only past candles to form each historical prediction and reports a chronological holdout; its hourly outcomes overlap, so its rows are not independent trades. A positive backtest result is a necessary check, not a guarantee.
      </p>
    </section>
  );
}
