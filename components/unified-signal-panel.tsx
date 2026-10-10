"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { buildUnifiedSignal } from "@/lib/research/unified-signal";
import type { OpportunityAnalysis } from "@/lib/opportunity/types";
import type { ForecastResult } from "@/lib/research/forecast";
import type { TrendRegimeResult } from "@/lib/research/trend-regime";

type Props = { analysis: OpportunityAnalysis };
type ForecastPayload = ForecastResult & { ok: boolean; error?: string };
type TrendPayload = TrendRegimeResult & { ok: boolean; error?: string };

const directionLabel = {
  BULLISH: "BULLISH",
  BEARISH: "BEARISH",
  NEUTRAL: "NEUTRAL",
  CONFLICT: "CONFLICT",
  INSUFFICIENT_DATA: "INSUFFICIENT DATA",
} as const;
const actionLabel = {
  BUY_CHEAP_SELL_EXPENSIVE: "RESEARCH ROUTE ALIGNED",
  WAIT_FOR_CONFIRMATION: "WAIT FOR CONFIRMATION",
  NO_TRADE: "NO TRADE",
  INSUFFICIENT_DATA: "INSUFFICIENT DATA",
} as const;

export function UnifiedSignalPanel({ analysis }: Props) {
  const [forecast, setForecast] = useState<ForecastResult | null>(null);
  const [trend, setTrend] = useState<TrendRegimeResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [forecastResponse, trendResponse] = await Promise.all([
        fetch("/api/research/forecast", { cache: "no-store" }),
        fetch("/api/research/trend-regime", { cache: "no-store" }),
      ]);
      const [forecastPayload, trendPayload] = await Promise.all([
        forecastResponse.json() as Promise<ForecastPayload>,
        trendResponse.json() as Promise<TrendPayload>,
      ]);
      if (!forecastResponse.ok || !forecastPayload.ok) throw new Error(forecastPayload.error ?? "Forecast unavailable");
      if (!trendResponse.ok || !trendPayload.ok) throw new Error(trendPayload.error ?? "Trend regime unavailable");
      setForecast(forecastPayload);
      setTrend(trendPayload);
      setError("");
    } catch (value) {
      setForecast(null);
      setTrend(null);
      setError(value instanceof Error ? value.message : "Unified signal engines are unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const signal = useMemo(
    () => buildUnifiedSignal({ opportunity: analysis, forecast, trend }),
    [analysis, forecast, trend],
  );
  const actionClass = signal.action === "BUY_CHEAP_SELL_EXPENSIVE"
    ? "isAligned"
    : signal.action === "INSUFFICIENT_DATA" ? "isUnavailable" : "isBlocked";

  return (
    <section className="unifiedSignal" aria-label="Unified market signal">
      <div className="unifiedSignalHeader">
        <div>
          <span className="sectionEyebrow">MARKET INTELLIGENCE · UNIFIED ENGINE</span>
          <h2>Final Signal</h2>
          <p>Forecast + Buy/Sell Balance + Trend Regime + Opportunity economics</p>
        </div>
        <span className={`unifiedSignalStatus ${actionClass}`}>{loading ? "SYNCING" : actionLabel[signal.action]}</span>
      </div>
      <div className="unifiedSignalMain">
        <div className="unifiedSignalDirection">
          <span>Directional read · 5m / 15m</span>
          <strong>{directionLabel[signal.direction]}</strong>
          <small>{signal.score == null ? "Score unavailable" : `15m combined evidence score: ${signal.score > 0 ? "+" : ""}${signal.score}/100`}</small>
        </div>
        <p>{signal.summary}</p>
      </div>
      <div className="unifiedHorizonGrid">
        {signal.horizons.map((item) => (
          <article className={`unifiedHorizon unifiedHorizon--${item.direction.toLowerCase().replaceAll("_", "-")}`} key={item.horizonMinutes}>
            <span>{item.horizonMinutes === 60 ? "1 HOUR" : `${item.horizonMinutes} MIN`}</span>
            <strong>{directionLabel[item.direction]}</strong>
            <small>{item.score == null ? "Score —" : `Score ${item.score > 0 ? "+" : ""}${item.score}`}</small>
            <small>Forecast {item.forecastScore == null ? "—" : Math.round(item.forecastScore)} · Balance {item.balanceScore == null ? "—" : Math.round(item.balanceScore)} · Trend {item.trendScore == null ? "—" : Math.round(item.trendScore)}</small>
          </article>
        ))}
      </div>
      <div className="unifiedSignalFooter">
        <div><span>Opportunity gate</span><strong>{signal.opportunityEligible ? "ECONOMICS PASSED" : "NOT ELIGIBLE"}</strong></div>
        <div><span>Evidence strength</span><strong>{signal.evidenceStrength}</strong></div>
        <div><span>Update</span><strong>{signal.generatedAt ? new Date(signal.generatedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—"}</strong></div>
      </div>
      {error && <p className="unifiedSignalWarning">One or more engines failed to refresh: {error}. The final signal is not cleared for trading.</p>}
      {signal.blockers.length > 0 && (
        <details className="unifiedSignalBlockers">
          <summary>Why this is not a trade ({signal.blockers.length} checks)</summary>
          <ul>{signal.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>
        </details>
      )}
      <p className="unifiedSignalDisclaimer">Research-only evidence score, not a probability of profit. Opportunity is an economic spread gate, not proof that the market will rise. No real orders are placed.</p>
    </section>
  );
}
