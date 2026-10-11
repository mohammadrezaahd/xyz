"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle } from "@/lib/candles";

type View = "intraday" | "daily" | "weekly";
type Level = { price: number; kind: "support" | "resistance"; touches: number };

function aggregate(candles: Candle[], view: View): Candle[] {
  if (view === "intraday") return candles;
  const buckets = new Map<number, Candle>();
  for (const candle of candles) {
    const date = new Date(candle.time * 1000);
    const start = view === "daily"
      ? Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 1000
      : (() => {
          const day = (date.getUTCDay() + 6) % 7;
          return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - day) / 1000;
        })();
    const old = buckets.get(start);
    if (!old) buckets.set(start, { ...candle, time: start });
    else buckets.set(start, { ...old, high: Math.max(old.high, candle.high), low: Math.min(old.low, candle.low), close: candle.close, volume: (old.volume ?? 0) + (candle.volume ?? 0) });
  }
  const result = [...buckets.values()].sort((a, b) => a.time - b.time);
  return view === "daily" ? result.slice(-90) : result.slice(-26);
}

function findLevels(candles: Candle[]): Level[] {
  const recent = candles.slice(-Math.min(240, candles.length));
  if (recent.length < 8) return [];
  const candidates: Array<{ price: number; kind: Level["kind"] }> = [];
  for (let i = 2; i < recent.length - 2; i += 1) {
    const c = recent[i];
    if (c.low <= recent[i - 1].low && c.low <= recent[i - 2].low && c.low <= recent[i + 1].low && c.low <= recent[i + 2].low) candidates.push({ price: c.low, kind: "support" });
    if (c.high >= recent[i - 1].high && c.high >= recent[i - 2].high && c.high >= recent[i + 1].high && c.high >= recent[i + 2].high) candidates.push({ price: c.high, kind: "resistance" });
  }
  const grouped: Level[] = [];
  for (const item of candidates) {
    const match = grouped.find((level) => level.kind === item.kind && Math.abs(level.price - item.price) <= 500);
    if (match) { match.price = Math.round((match.price * match.touches + item.price) / (match.touches + 1)); match.touches += 1; }
    else grouped.push({ ...item, touches: 1 });
  }
  const last = recent[recent.length - 1].close;
  return grouped.filter((level) => level.kind === "support" ? level.price <= last : level.price >= last)
    .sort((a, b) => Math.abs(a.price - last) - Math.abs(b.price - last)).slice(0, 4);
}

function assessBreak(candles: Candle[], levels: Level[]) {
  if (candles.length < 15) return { label: "Insufficient data", tone: "neutral", detail: "More closed candles are needed to assess a level." };
  const last = candles[candles.length - 1];
  const before = candles[Math.max(0, candles.length - 16)];
  const momentum = ((last.close - before.close) / before.close) * 100;
  const level = levels.find((item) => item.kind === (momentum < 0 ? "support" : "resistance"));
  if (!level) return { label: "No nearby level", tone: "neutral", detail: "No clear local swing level was detected." };
  const distance = Math.abs((level.price - last.close) / last.close) * 100;
  if (distance <= 0.8 && Math.abs(momentum) >= 0.25) return {
    label: momentum < 0 ? "Support-break risk elevated" : "Resistance-breakout pressure elevated",
    tone: "warning",
    detail: "Price is " + distance.toFixed(2) + "% from " + level.kind + " at " + Math.round(level.price).toLocaleString("en-US") + "; recent momentum is " + momentum.toFixed(2) + "%. Pressure is not confirmation.",
  };
  if (distance <= 1.2) return { label: level.kind === "support" ? "Support under watch" : "Resistance under watch", tone: "watch", detail: "Nearest " + level.kind + " is " + Math.round(level.price).toLocaleString("en-US") + " (" + distance.toFixed(2) + "% away). Wait for a candle close and retest." };
  return { label: "No strong break signal", tone: "neutral", detail: "Nearest relevant level is " + Math.round(level.price).toLocaleString("en-US") + "; recent momentum is " + momentum.toFixed(2) + "%. Evidence is not strong enough to classify a likely break." };
}

export function CandleChart({ candles, historicalCandles = [] }: { candles: Candle[]; historicalCandles?: Candle[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const priceLinesRef = useRef<Array<ReturnType<ISeriesApi<"Candlestick">["createPriceLine"]>>>([]);
  const [view, setView] = useState<View>("intraday");
  const sourceCandles = view === "intraday" || historicalCandles.length === 0 ? candles : historicalCandles;
  const visibleCandles = useMemo(() => aggregate(sourceCandles, view), [sourceCandles, view]);
  const levels = useMemo(() => findLevels(sourceCandles), [sourceCandles]);
  const risk = useMemo(() => assessBreak(sourceCandles, levels), [sourceCandles, levels]);

  useEffect(() => {
    if (!ref.current) return;

    const chart = createChart(ref.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#0c1118" },
        textColor: "#718096",
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        attributionLogo: true,
      },
      grid: {
        vertLines: { color: "rgba(148,163,184,.08)" },
        horzLines: { color: "rgba(148,163,184,.08)" },
      },
      rightPriceScale: {
        borderColor: "rgba(148,163,184,.16)",
      },
      timeScale: {
        borderColor: "rgba(148,163,184,.16)",
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: { mode: 1 },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#35c98a",
      downColor: "#ff5f67",
      borderUpColor: "#35c98a",
      borderDownColor: "#ff5f67",
      borderVisible: true,
      wickUpColor: "#35c98a",
      wickDownColor: "#ff5f67",
      priceLineVisible: false,
      lastValueVisible: true,
      priceFormat: { type: "price", precision: 0, minMove: 1 },
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const ro = new ResizeObserver(() => {
      if (!ref.current) return;
      chart.resize(ref.current.clientWidth, ref.current.clientHeight);
    });

    ro.observe(ref.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    const data: CandlestickData<UTCTimestamp>[] = visibleCandles.map((c) => ({
      time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close,
    }));
    series.setData(data);
    for (const line of priceLinesRef.current) series.removePriceLine(line);
    priceLinesRef.current = [];
    if (visibleCandles.length) {
      const low = Math.min(...visibleCandles.map((c) => c.low));
      const high = Math.max(...visibleCandles.map((c) => c.high));
      for (let price = Math.ceil(low / 1000) * 1000; price <= high; price += 1000) {
        priceLinesRef.current.push(series.createPriceLine({ price, color: "rgba(148,163,184,.13)", lineWidth: 1, lineStyle: 3, axisLabelVisible: true, title: "" }));
      }
    }
    for (const level of levels) {
      priceLinesRef.current.push(series.createPriceLine({
        price: level.price, color: level.kind === "support" ? "rgba(53,201,138,.9)" : "rgba(255,191,71,.9)",
        lineWidth: level.touches > 1 ? 2 : 1, lineStyle: 2, axisLabelVisible: true,
        title: (level.kind === "support" ? "S" : "R") + " · " + level.touches + "x",
      }));
    }
    chartRef.current?.timeScale().fitContent();
  }, [visibleCandles, levels]);

  return (
    <div className="chartFrame">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "8px 10px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6 }} aria-label="Chart timeframe">
          {([{ value: "intraday", label: "Intraday" }, { value: "daily", label: "Daily" }, { value: "weekly", label: "Weekly" }] as Array<{ value: View; label: string }>).map((item) =>
            <button key={item.value} type="button" aria-pressed={view === item.value} onClick={() => setView(item.value)} style={{ border: "1px solid rgba(148,163,184,.24)", borderRadius: 7, padding: "5px 9px", background: view === item.value ? "rgba(56,189,248,.15)" : "transparent", color: view === item.value ? "#7dd3fc" : "#94a3b8", cursor: "pointer", fontSize: 12 }}>{item.label}</button>
          )}
        </div>
        <span style={{ color: "#64748b", fontSize: 11 }}>1,000-Toman grid · {visibleCandles.length} candles</span>
      </div>
      <div ref={ref} className="chart" aria-label={"Candlestick market chart, " + view + " view"} role="img" />
      <div style={{ display: "flex", gap: 12, padding: "0 12px 8px", color: "#94a3b8", fontSize: 11, flexWrap: "wrap" }}>
        <span><span style={{ color: "#35c98a" }}>━</span> Support</span><span><span style={{ color: "#ffbf47" }}>━</span> Resistance</span>
        <span>Local swing levels, not guaranteed barriers.</span>
      </div>
      <div style={{ margin: "0 10px 10px", padding: "9px 11px", borderRadius: 8, border: "1px solid " + (risk.tone === "warning" ? "rgba(255,95,103,.4)" : risk.tone === "watch" ? "rgba(255,191,71,.35)" : "rgba(148,163,184,.18)"), background: risk.tone === "warning" ? "rgba(255,95,103,.08)" : risk.tone === "watch" ? "rgba(255,191,71,.06)" : "rgba(148,163,184,.04)" }}>
        <strong style={{ display: "block", color: risk.tone === "warning" ? "#ff8d93" : risk.tone === "watch" ? "#ffcf70" : "#cbd5e1", fontSize: 12 }}>{risk.label}</strong>
        <span style={{ display: "block", color: "#94a3b8", fontSize: 11, lineHeight: 1.5, marginTop: 3 }}>{risk.detail}</span>
      </div>
      {!visibleCandles.length && <div className="chartEmpty" role="status"><strong>No candles available</strong><span>Long-range history may be temporarily unavailable.</span></div>}
    </div>
  );
}
