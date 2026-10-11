"use client";

import { useMemo } from "react";
import type { Candle } from "@/lib/candles";

function formatPrice(value: number) {
  return Math.round(value).toLocaleString("en-US");
}

export function WeeklyAnalysisPanel({ bitpin, wallex }: { bitpin: Candle[]; wallex: Candle[] }) {
  const analysis = useMemo(() => {
    const calculate = (candles: Candle[]) => {
      const sorted = [...candles].sort((a, b) => a.time - b.time);
      if (sorted.length < 30) return null;
      const latest = sorted[sorted.length - 1];
      const cutoff = latest.time - 7 * 24 * 60 * 60;
      const weekAgo = sorted.find((candle) => candle.time >= cutoff);
      const base = weekAgo ?? sorted[0];
      const returnPct = ((latest.close - base.close) / base.close) * 100;
      const recentDay = sorted.filter((candle) => candle.time >= latest.time - 24 * 60 * 60);
      const dayBase = recentDay[0] ?? base;
      const dailyPct = ((latest.close - dayBase.close) / dayBase.close) * 100;
      const recentWeek = sorted.filter((candle) => candle.time >= cutoff);
      const high = Math.max(...recentWeek.map((candle) => candle.high));
      const low = Math.min(...recentWeek.map((candle) => candle.low));
      const direction = returnPct > 0.35 && dailyPct >= -0.2 ? "UP" : returnPct < -0.35 && dailyPct <= 0.2 ? "DOWN" : "FLAT";
      const confidence = Math.min(70, Math.max(25, 35 + Math.abs(returnPct) * 5 + Math.abs(dailyPct) * 2));
      return { latest: latest.close, returnPct, dailyPct, high, low, direction, confidence, start: base.time, end: latest.time };
    };
    return { bitpin: calculate(bitpin), wallex: calculate(wallex) };
  }, [bitpin, wallex]);

  return (
    <section style={{ border: "1px solid rgba(148,163,184,.18)", borderRadius: 12, padding: 16, background: "rgba(15,23,42,.5)", marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12, flexWrap: "wrap" }}>
        <div><div style={{ color: "#7dd3fc", fontSize: 11, letterSpacing: 1.2, fontWeight: 700 }}>WEEKLY FORECAST & ANALYSIS</div><h2 style={{ color: "#e2e8f0", fontSize: 18, margin: "5px 0" }}>Weekly forecast & analysis</h2></div>
        <span style={{ color: "#94a3b8", fontSize: 11 }}>Heuristic trend estimate · not a calibrated probability</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 12 }}>
        {(["bitpin", "wallex"] as const).map((venue) => {
          const item = analysis[venue];
          return <article key={venue} style={{ border: "1px solid rgba(148,163,184,.14)", borderRadius: 9, padding: 12 }}>
            <div style={{ color: "#94a3b8", fontSize: 11, textTransform: "uppercase" }}>{venue}</div>
            {!item ? <p style={{ color: "#94a3b8", fontSize: 13 }}>Not enough candles for a weekly assessment.</p> : <>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginTop: 6 }}>
                <strong style={{ color: item.direction === "UP" ? "#35c98a" : item.direction === "DOWN" ? "#ff858b" : "#fbbf24", fontSize: 19 }}>{item.direction === "UP" ? "Bullish bias" : item.direction === "DOWN" ? "Bearish bias" : "Neutral / mixed"}</strong>
                <span style={{ color: "#cbd5e1", fontSize: 13 }}>{item.returnPct >= 0 ? "+" : ""}{item.returnPct.toFixed(2)}%</span>
              </div>
              <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 8, lineHeight: 1.7 }}>Latest: {formatPrice(item.latest)} Toman<br />Observed 7-day range: {formatPrice(item.low)} – {formatPrice(item.high)}<br />Latest 24h move: {item.dailyPct >= 0 ? "+" : ""}{item.dailyPct.toFixed(2)}%</div>
              <div style={{ marginTop: 10, height: 5, borderRadius: 8, background: "rgba(148,163,184,.15)", overflow: "hidden" }}><div style={{ width: String(item.confidence) + "%", height: "100%", background: item.direction === "UP" ? "#35c98a" : item.direction === "DOWN" ? "#ff5f67" : "#fbbf24" }} /></div>
              <p style={{ color: "#64748b", fontSize: 11, lineHeight: 1.5, marginBottom: 0 }}>Trend-strength indicator: {item.confidence}% (not win probability). Based on available hourly candles from {new Date(item.start * 1000).toLocaleDateString()} to {new Date(item.end * 1000).toLocaleDateString()}.</p>
            </>}
          </article>;
        })}
      </div>
      <p style={{ color: "#94a3b8", fontSize: 12, lineHeight: 1.6, marginBottom: 0, marginTop: 12 }}>This is a directional outlook derived from observed returns and short-term momentum. It does not claim to predict the next week's return with validated accuracy; reliable out-of-sample backtesting is needed before treating it as a calibrated forecast.</p>
    </section>
  );
}
