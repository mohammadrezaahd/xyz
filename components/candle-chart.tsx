"use client";

import { useEffect, useRef } from "react";
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

export function CandleChart({ candles }: { candles: Candle[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

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
    if (!seriesRef.current || !candles.length) return;

    const data: CandlestickData<UTCTimestamp>[] = candles.map((c) => ({
      time: c.time as UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    seriesRef.current.setData(data);
    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  return (
    <div className="chartFrame">
      <div ref={ref} className="chart" aria-label="Candlestick market chart" role="img" />
      {!candles.length && (
        <div className="chartEmpty" role="status">
          <strong>No synchronized candles available</strong>
          <span>The analysis requires 10 closed candle pairs.</span>
        </div>
      )}
    </div>
  );
}
