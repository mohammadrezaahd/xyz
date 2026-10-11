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

export function CandleChart({ candles, historicalCandles = [] }: { candles: Candle[]; historicalCandles?: Candle[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const priceLinesRef = useRef<Array<ReturnType<ISeriesApi<"Candlestick">["createPriceLine"]>>>([]);
  const [view, setView] = useState<View>("intraday");
  const [showSupport, setShowSupport] = useState(false);
  const [showResistance, setShowResistance] = useState(false);
  const sourceCandles = view === "intraday" || historicalCandles.length === 0 ? candles : historicalCandles;
  const visibleCandles = useMemo(() => aggregate(sourceCandles, view), [sourceCandles, view]);
  const levels = useMemo(() => findLevels(sourceCandles), [sourceCandles]);

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
    for (const level of levels) {
      if ((level.kind === "support" && !showSupport) || (level.kind === "resistance" && !showResistance)) continue;
      priceLinesRef.current.push(series.createPriceLine({
        price: level.price, color: level.kind === "support" ? "rgba(53,201,138,.9)" : "rgba(255,191,71,.9)",
        lineWidth: level.touches > 1 ? 2 : 1, lineStyle: 2, axisLabelVisible: true,
        title: (level.kind === "support" ? "S" : "R") + " · " + level.touches + "x",
      }));
    }
    chartRef.current?.timeScale().fitContent();
  }, [visibleCandles, levels, showSupport, showResistance]);

  return (
    <div className="chartFrame">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "8px 10px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6 }} aria-label="Chart timeframe">
          {([{ value: "intraday", label: "Intraday" }, { value: "daily", label: "Daily" }, { value: "weekly", label: "Weekly" }] as Array<{ value: View; label: string }>).map((item) =>
            <button key={item.value} type="button" aria-pressed={view === item.value} onClick={() => setView(item.value)} style={{ border: "1px solid rgba(148,163,184,.24)", borderRadius: 7, padding: "5px 9px", background: view === item.value ? "rgba(56,189,248,.15)" : "transparent", color: view === item.value ? "#7dd3fc" : "#94a3b8", cursor: "pointer", fontSize: 12 }}>{item.label}</button>
          )}
        </div>
        <span style={{ color: "#64748b", fontSize: 11 }}>{visibleCandles.length} candles</span>
      </div>
      <div ref={ref} className="chart" aria-label={"Candlestick market chart, " + view + " view"} role="img" />
      <div style={{ display: "flex", gap: "8px 16px", padding: "0 12px 10px", color: "#cbd5e1", fontSize: 12, flexWrap: "wrap", alignItems: "center" }}>
        {([
          { label: "Support", checked: showSupport, change: setShowSupport, color: "#35c98a" },
          { label: "Resistance", checked: showResistance, change: setShowResistance, color: "#ffbf47" },
        ] as const).map((item) => (
          <label key={item.label} style={{ display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer", userSelect: "none" }}>
            <input className="chartDisplaySwitch" type="checkbox" role="switch" aria-label={"Show " + item.label} checked={item.checked} onChange={(event) => item.change(event.target.checked)} style={{ appearance: "none", width: 30, height: 17, borderRadius: 999, position: "relative", margin: 0, background: item.checked ? item.color : "#475569", cursor: "pointer", transition: "background .15s", flexShrink: 0, outlineOffset: 2 }} />
            <span>{item.label}</span>
          </label>
        ))}
      </div>
      <div style={{ display: "flex", gap: 12, padding: "0 12px 8px", color: "#94a3b8", fontSize: 11, flexWrap: "wrap" }}>
        {showSupport && <span><span style={{ color: "#35c98a" }}>━</span> Support</span>}
        {showResistance && <span><span style={{ color: "#ffbf47" }}>━</span> Resistance</span>}
        {(showSupport || showResistance) && <span>Local swing levels, not guaranteed barriers.</span>}
      </div>
      {!visibleCandles.length && <div className="chartEmpty" role="status"><strong>No candles available</strong><span>Long-range history may be temporarily unavailable.</span></div>}
    </div>
  );
}
