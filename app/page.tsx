"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CandleChart } from "@/components/candle-chart";
import { BuySellBalance } from "@/components/buy-sell-balance";
import { OpportunityPanel } from "@/components/opportunity-panel";
import { Phase3Panel } from "@/components/phase3-panel";
import { SnapshotPage } from "@/components/snapshot-page";
import { MarketForecastPanel } from "@/components/market-forecast-panel";
import { TrendRegimePanel } from "@/components/trend-regime-panel";
import { UnifiedSignalPanel } from "@/components/unified-signal-panel";
import { TestPositionPanel } from "@/components/test-position-panel";
import { analyzeOpportunity } from "@/lib/opportunity/engine";
import type { Candle } from "@/lib/candles";
import type { CurrentPricesResponse } from "@/lib/prices";
import type { MarketSnapshotTrend } from "@/lib/market-snapshots/types";

type CandleResponse = { bitpin: Candle[]; wallex: Candle[]; errors: string[]; fetchedAt: number; refreshMs: number };
type View = "overview" | "charts" | "opportunity" | "balance" | "position" | "history" | "snapshots" | "forecast" | "details";

const snapshotTrends: Array<{ value: MarketSnapshotTrend; label: string }> = [
  { value: "STRONGLY_BULLISH", label: "Strongly Bullish" },
  { value: "BULLISH", label: "Bullish" },
  { value: "STABLE", label: "Stable" },
  { value: "BEARISH", label: "Bearish" },
  { value: "STRONGLY_BEARISH", label: "Strongly Bearish" },
];

function price(value: number | null | undefined) { return value == null ? "—" : value.toLocaleString("en-US", { maximumFractionDigits: 2 }); }
function time(value: number | undefined) { return value ? new Date(value).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—"; }
function percent(value: number | null | undefined) { return value == null ? "—" : `${value.toFixed(2)}%`; }

function StatusBadge({ kind, children }: { kind: "live" | "partial" | "stale" | "error" | "neutral"; children: React.ReactNode }) {
  return <span className={`statusBadge statusBadge--${kind}`}><span className="statusMarker" aria-hidden="true" />{children}</span>;
}

function Metric({ label, value, state, helper }: { label: string; value: string; state: string; helper: string }) {
  return <article className="metricTile"><div className="metricLabel">{label}</div><strong className="metricValue">{value}</strong><div className="metricState">{state}</div><div className="metricHelper">{helper}</div></article>;
}

const viewCopy: Record<View, { breadcrumb: string; title: string; footer: string }> = {
  overview: { breadcrumb: "OVERVIEW", title: "Market overview", footer: "Analysis and simulation only" },
  charts: { breadcrumb: "CHARTS", title: "Market charts", footer: "Live exchange prices and synchronized candles" },
  opportunity: { breadcrumb: "OPPORTUNITY", title: "Opportunity", footer: "Analysis and simulation only" },
  balance: { breadcrumb: "BUY / SELL BALANCE", title: "Buy / Sell Balance", footer: "Directional evidence and data quality diagnostics" },
  position: { breadcrumb: "PAPER POSITION", title: "Paper Position", footer: "Paper research · No automated trading execution" },
  history: { breadcrumb: "HISTORY", title: "History", footer: "Opportunity cron results · Analysis and simulation only" },
  snapshots: { breadcrumb: "SNAPSHOTS", title: "Market snapshots", footer: "Point-in-time research archive" },
  forecast: { breadcrumb: "FORECAST", title: "Market Forecast", footer: "Experimental forecast · Historical validation required" },
  details: { breadcrumb: "DETAILS & LOGS", title: "Details & Logs", footer: "Diagnostics, model validation and provider details" },
};

const navigation: Array<[View, string, string, string]> = [
  ["overview", "Overview", "Overview", "01"],
  ["opportunity", "Opportunity", "Opportunity", "02"],
  ["position", "Paper Position", "Paper Position", "03"],
  ["history", "History", "History", "04"],
  ["snapshots", "Snapshots", "Snapshots", "05"],
  ["forecast", "Market Forecast", "Forecast", "06"],
  ["details", "Details & Logs", "Details", "07"],
  ["charts", "Charts", "Charts", "08"],
  ["balance", "Buy / Sell Balance", "Balance", "09"],
];

export default function Home() {
  const [data, setData] = useState<CandleResponse | null>(null);
  const [prices, setPrices] = useState<CurrentPricesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [externalPrice, setExternalPrice] = useState("");
  const [externalPriceCustomized, setExternalPriceCustomized] = useState(false);
  const [view, setView] = useState<View>("overview");
  const [refreshTick, setRefreshTick] = useState(0);
  const [snapshotDialogOpen, setSnapshotDialogOpen] = useState(false);
  const [snapshotSaving, setSnapshotSaving] = useState(false);
  const [snapshotError, setSnapshotError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [candleResponse, priceResponse] = await Promise.all([
        fetch("/api/candles", { cache: "no-store" }),
        fetch("/api/prices", { cache: "no-store" }),
      ]);
      const candleJson = (await candleResponse.json()) as CandleResponse;
      const priceJson = (await priceResponse.json()) as CurrentPricesResponse;
      if (!candleResponse.ok) throw new Error(candleJson.errors?.join("\\n") || `Candle API HTTP ${candleResponse.status}`);
      if (!priceResponse.ok) throw new Error(priceJson.errors?.join("\\n") || `Price API HTTP ${priceResponse.status}`);
      setData(candleJson); setPrices(priceJson); setError([...(candleJson.errors ?? []), ...(priceJson.errors ?? [])].join("\\n"));
    } catch (value) { setError(value instanceof Error ? value.message : "Unable to load market data"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); const timer = window.setInterval(load, Number(process.env.NEXT_PUBLIC_CANDLE_REFRESH_MS ?? 15000)); return () => window.clearInterval(timer); }, [load, refreshTick]);

  useEffect(() => {
    const openForecast = () => setView("forecast");
    window.addEventListener("xyz-open-forecast", openForecast);
    return () => window.removeEventListener("xyz-open-forecast", openForecast);
  }, []);

  useEffect(() => {
    if (!externalPriceCustomized && prices?.wallex != null) {
      setExternalPrice(String(prices.wallex));
    }
  }, [prices?.wallex, externalPriceCustomized]);

  const analysis = useMemo(() => analyzeOpportunity({ bitpinCandles: data?.bitpin ?? [], wallexCandles: data?.wallex ?? [], currentPrices: { bitpin: prices?.bitpin ?? null, wallex: prices?.wallex ?? null, fetchedAt: prices?.fetchedAt ?? null }, externalPrice: externalPrice.trim() ? Number(externalPrice) : null, nowMs: Date.now() }), [data, prices, externalPrice]);
  const hasPrices = prices?.bitpin != null && prices?.wallex != null;
  const hasCandles = analysis.candles.synchronized > 0;
  const statusKind = loading ? "neutral" : error ? "error" : hasPrices && hasCandles ? "live" : hasPrices ? "partial" : "stale";
  const statusText = loading ? "Syncing market data" : error ? "Provider warning" : hasPrices && hasCandles ? "Live data" : hasPrices ? "Partial data" : "Waiting for market data";

  const copy = viewCopy[view];
  const nav = (next: View) => setView(next);

  const openSnapshotDialog = () => {
    setSnapshotError("");
    setSnapshotDialogOpen(true);
  };

  const saveSnapshot = async (trend: MarketSnapshotTrend) => {
    setSnapshotSaving(true);
    setSnapshotError("");
    try {
      const response = await fetch("/api/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trend, analysis }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? `Snapshot API HTTP ${response.status}`);
      setSnapshotDialogOpen(false);
      nav("snapshots");
    } catch (value) {
      setSnapshotError(value instanceof Error ? value.message : "Unable to save snapshot");
    } finally {
      setSnapshotSaving(false);
    }
  };

  return <div className="consoleApp">
    <aside className="sidebar">
      <div className="brandLockup"><div className="brandMark" aria-hidden="true">X</div><div><strong>XYZ</strong><span>RESEARCH CONSOLE</span></div></div>
      <div className="marketIdentity"><span className="marketIdentityLabel">MARKET</span><strong>USDT / TOMAN</strong><span>Bitpin ↔ Wallex</span></div>
      <nav className="primaryNav" aria-label="Research areas">
        {navigation.map(([id, desktopLabel, mobileLabel, number]) => <button key={id} type="button" className={`navItem ${view === id ? "isActive" : ""}`} aria-label={desktopLabel} aria-current={view === id ? "page" : undefined} onClick={() => nav(id)}><span>{number}</span><strong><span className="navLabelDesktop">{desktopLabel}</span><span className="navLabelMobile">{mobileLabel}</span></strong></button>)}
      </nav>
      <div className="sidebarFoot"><StatusBadge kind={statusKind}>{statusText}</StatusBadge><p>{view === "history" || view === "opportunity" ? "Phase 3 Opportunity Cron" : view === "snapshots" ? "Point-in-time archive" : "Phase 4 · Paper Research"}</p><p>Analysis only. No real trades.</p></div>
    </aside>

    <main className="mainContent">
      <header className="consoleHeader"><div><div className="breadcrumb">XYZ / {copy.breadcrumb}</div><h1>{copy.title}</h1><p>Bitpin / Wallex · USDT / Toman</p></div><div className="headerActions"><StatusBadge kind={statusKind}>{statusText}</StatusBadge><div className="updateMeta"><span>Last successful update</span><strong>{time(prices?.fetchedAt)}</strong></div><button className="refreshButton" type="button" onClick={() => setRefreshTick((tick) => tick + 1)} disabled={loading}>{loading ? "Updating…" : "Refresh"}</button></div></header>
      <div className="dataStatusBar" role="status"><div><span className="statusMarker" aria-hidden="true" /><strong>{loading ? "Syncing market data…" : hasPrices && hasCandles ? "Bitpin and Wallex data synchronized" : hasPrices ? "Partial market data" : "Market data unavailable"}</strong></div>{view === "details" && <span>{analysis.candles.synchronized.toLocaleString("en-US")} / {analysis.candles.lookback.toLocaleString("en-US")} synchronized pairs</span>}</div>

      {view === "overview" && <section className="dashboardOverview">
        <UnifiedSignalPanel analysis={analysis} />
        <TrendRegimePanel mode="compact" />
        <MarketForecastPanel mode="compact" />
        <section className="dashboardPrices" aria-label="Current market prices">
          <div className="dashboardPrice"><span>BITPIN</span><strong>{price(prices?.bitpin)}</strong><small>TOMAN</small></div>
          <div className="dashboardSpread"><span>SPREAD</span><strong>{percent(analysis.spread.percent)}</strong></div>
          <div className="dashboardPrice"><span>WALLEX</span><strong>{price(prices?.wallex)}</strong><small>TOMAN</small></div>
        </section>
        <section className="dashboardChartGrid" aria-label="Market charts">
          <article className="chartPane"><div className="chartPaneHeader"><div><strong>Bitpin</strong><span>{price(prices?.bitpin)} Toman</span></div><span>{data?.bitpin.length ?? 0} candles</span></div><CandleChart candles={data?.bitpin ?? []} /></article>
          <article className="chartPane"><div className="chartPaneHeader"><div><strong>Wallex</strong><span>{price(prices?.wallex)} Toman</span></div><span>{data?.wallex.length ?? 0} candles</span></div><CandleChart candles={data?.wallex ?? []} /></article>
        </section>
        <section className="dashboardOpportunity" aria-label="Current opportunity">
          <div className="dashboardWidgetHeader"><h2>Opportunity</h2><button type="button" className="textLinkButton" onClick={() => nav("opportunity")}>Open ↗</button></div>
          <div className="dashboardOpportunityMain"><strong>{analysis.opportunity === "NONE" ? "WAITING" : analysis.opportunity}</strong><span>{analysis.decision?.startsWith("NO_TRADE") ? "NO TRADE" : analysis.decision ?? "WAITING FOR DATA"}</span></div>
          <div className="dashboardMiniStats"><div><span>Spread</span><strong>{percent(analysis.spread.percent)}</strong></div><div><span>Net edge</span><strong>{percent(analysis.edge.executionNetPct)}</strong></div><div><span>Target</span><strong>{price(analysis.target.safeTarget)}</strong></div></div>
        </section>
        <section className="dashboardBalance">
          <div className="dashboardWidgetHeader"><h2>Buy / Sell Balance</h2><button type="button" className="textLinkButton" onClick={() => nav("balance")}>Open ↗</button></div>
          <BuySellBalance candles={analysis.candles} balance={analysis.buySellBalance} dataCompleteness={analysis.dataCompleteness} dataQuality={analysis.dataQuality} synchronizedCandlePairs={analysis.candles.synchronizedAvailable} minimumRequiredCandlePairs={analysis.minimumRequiredCandlePairs} netEdgePct={analysis.edge.executionNetPct} decision={analysis.decision} decisionReason={analysis.decisionReason} compact />
        </section>
      </section>}
      {view === "charts" && <section className="workspacePage chartsWorkspace"><section className="chartSection" aria-label="Synchronized candle history"><div className="sectionHeader"><div><div className="sectionEyebrow">LIVE MARKET</div><h2>Synchronized candle history</h2></div><span className="sectionNote">1 minute · {data?.bitpin.length ?? 0} Bitpin / {data?.wallex.length ?? 0} Wallex candles</span></div><div className="chartPair"><div className="chartPane"><div className="chartPaneHeader"><div><strong>Bitpin</strong><span>{price(prices?.bitpin)} Toman</span></div><span>{data?.bitpin.length ?? 0} candles</span></div><CandleChart candles={data?.bitpin ?? []} /></div><div className="chartPane"><div className="chartPaneHeader"><div><strong>Wallex</strong><span>{price(prices?.wallex)} Toman</span></div><span>{data?.wallex.length ?? 0} candles</span></div><CandleChart candles={data?.wallex ?? []} /></div></div></section></section>}
      {view === "opportunity" && <section className="workspacePage"><div className="pageIntro"><div className="sectionEyebrow">OPPORTUNITY</div><h2>Current opportunity</h2></div><section className="commandCenter" aria-label="Opportunity decision"><div className="commandMain"><div className="sectionEyebrow">DECISION</div><div className="commandHeading"><div><h2>{analysis.decision?.startsWith("NO_TRADE") ? "NO TRADE" : analysis.decision ?? "WAITING FOR DATA"}</h2><p>{analysis.decisionReason ?? "A reliable decision is not available yet."}</p></div><StatusBadge kind={analysis.decision?.startsWith("NO_TRADE") ? "partial" : "neutral"}>{analysis.opportunity} opportunity</StatusBadge></div><div className="commandStats"><div><span>Spread</span><strong>{percent(analysis.spread.percent)}</strong></div><div><span>Net edge</span><strong>{percent(analysis.edge.executionNetPct)}</strong></div><div><span>Entry · Bitpin</span><strong>{price(analysis.target.entryPrice)}</strong></div><div><span>Fee-adjusted target</span><strong>{price(analysis.target.safeTarget)}</strong></div></div><div className="commandFooter"><label className="inputField"><span>External Tether Price</span><input inputMode="decimal" type="text" value={externalPrice} onChange={(event) => { setExternalPriceCustomized(true); setExternalPrice(event.target.value); }} placeholder="Wallex ticker" /></label><div className="commandFooterActions"><button type="button" className="primaryButton" onClick={() => nav("details")}>Open diagnostics</button></div></div></div><div className="verdictRail"><span>ECONOMIC GATE</span><strong>{analysis.edge.executionNetPct != null && analysis.edge.executionNetPct > 0 ? "CHECK OTHER GATES" : "NO TRADE"}</strong><p>{analysis.edge.executionNetPct == null ? "Net edge unavailable" : `Net edge ${percent(analysis.edge.executionNetPct)}`}</p></div></section></section>}
      {view === "balance" && <section className="workspacePage"><BuySellBalance candles={analysis.candles} balance={analysis.buySellBalance} dataCompleteness={analysis.dataCompleteness} dataQuality={analysis.dataQuality} synchronizedCandlePairs={analysis.candles.synchronizedAvailable} minimumRequiredCandlePairs={analysis.minimumRequiredCandlePairs} netEdgePct={analysis.edge.executionNetPct} decision={analysis.decision} decisionReason={analysis.decisionReason} /></section>}
      {view === "position" && <section className="workspacePage"><div className="pageIntro"><div className="sectionEyebrow">PHASE 4 WORKSPACE</div><h2>Paper Position</h2><p>Run and monitor a research-only paper position. No real funds or exchange orders are used.</p></div><TestPositionPanel currentPrice={prices?.bitpin ?? null} /></section>}
      {view === "history" && <section className="workspacePage"><div className="pageIntro"><div className="sectionEyebrow">PHASE 3 RESULTS</div><h2>History</h2><p>Review opportunity cron results, validation scores, and simulated outcomes.</p></div><Phase3Panel /></section>}
      {view === "snapshots" && <SnapshotPage />}
      {view === "forecast" && <section className="workspacePage"><MarketForecastPanel mode="summary" /></section>}
      {view === "details" && <section className="workspacePage"><div className="pageIntro"><div className="sectionEyebrow">DETAILS &amp; LOGS</div><h2>Technical details and logs</h2></div><details className="diagnosticAccordion"><summary>Opportunity &amp; Stability diagnostics</summary><OpportunityPanel analysis={analysis} externalPrice={externalPrice} onExternalPriceChange={(value) => { setExternalPriceCustomized(true); setExternalPrice(value); }} /></details><details className="diagnosticAccordion"><summary>Trend regime and exit-timing backtest</summary><TrendRegimePanel mode="details" /></details><details className="diagnosticAccordion"><summary>Short-term forecast, validation and stability research</summary><MarketForecastPanel mode="details" /></details><details className="diagnosticAccordion"><summary>Synchronized raw candle charts</summary><section className="chartSection" aria-labelledby="chart-title"><div className="sectionHeader"><div><div className="sectionEyebrow">PRICE RELATIONSHIP</div><h2 id="chart-title">Synchronized candle history</h2></div><span className="sectionNote">1 minute · {data?.bitpin.length ?? 0} Bitpin / {data?.wallex.length ?? 0} Wallex candles</span></div><div className="chartPair"><div className="chartPane"><div className="chartPaneHeader"><div><strong>Bitpin</strong><span>{price(prices?.bitpin)} Toman</span></div><span>{data?.bitpin.length ?? 0} candles</span></div><CandleChart candles={data?.bitpin ?? []} /></div><div className="chartPane"><div className="chartPaneHeader"><div><strong>Wallex</strong><span>{price(prices?.wallex)} Toman</span></div><span>{data?.wallex.length ?? 0} candles</span></div><CandleChart candles={data?.wallex ?? []} /></div></div></section></details></section>}
      {error && view !== "snapshots" && view !== "forecast" && <div className="errorBanner" role="alert"><strong>Provider warning</strong><span>{error}</span></div>}
      <footer className="consoleFooter"><span>XYZ Research Console</span><span>{copy.footer}</span></footer>
    </main>

    {snapshotDialogOpen && <div className="snapshotDialogBackdrop" role="presentation" onMouseDown={() => !snapshotSaving && setSnapshotDialogOpen(false)}>
      <section className="snapshotDialog" role="dialog" aria-modal="true" aria-labelledby="snapshot-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="snapshotDialogHeader"><div><div className="sectionEyebrow">CREATE SNAPSHOT</div><h2 id="snapshot-dialog-title">What is the current market trend?</h2><p>Choose the market state you observe right now. The complete Opportunity Analysis will be persisted with your choice.</p></div><button type="button" className="snapshotDialogClose" onClick={() => setSnapshotDialogOpen(false)} disabled={snapshotSaving} aria-label="Close">×</button></div>
        <div className="snapshotTrendGrid">
          {snapshotTrends.map((trend) => <button key={trend.value} type="button" className="snapshotTrendButton" onClick={() => void saveSnapshot(trend.value)} disabled={snapshotSaving}><strong>{trend.label}</strong><span>{trend.value}</span></button>)}
        </div>
        {snapshotSaving && <div className="snapshotDialogStatus">Saving snapshot…</div>}
        {snapshotError && <div className="errorBanner" role="alert"><strong>Snapshot error</strong><span>{snapshotError}</span></div>}
      </section>
    </div>}
  </div>;
}
