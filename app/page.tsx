"use client";

import { useEffect, useMemo, useState } from "react";
import { CandleChart } from "@/components/candle-chart";
import { OpportunityPanel } from "@/components/opportunity-panel";
import { analyzeOpportunity } from "@/lib/opportunity/engine";
import type { Candle } from "@/lib/candles";
import type { CurrentPricesResponse } from "@/lib/prices";

type CandleResponse = {
  bitpin: Candle[];
  wallex: Candle[];
  errors: string[];
  fetchedAt: number;
  refreshMs: number;
};

export default function Home() {
  const [data, setData] = useState<CandleResponse | null>(null);
  const [prices, setPrices] =
    useState<CurrentPricesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [externalPrice, setExternalPrice] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [candleResponse, priceResponse] =
          await Promise.all([
            fetch("/api/candles", { cache: "no-store" }),
            fetch("/api/prices", { cache: "no-store" }),
          ]);

        const candleJson =
          (await candleResponse.json()) as CandleResponse;
        const priceJson =
          (await priceResponse.json()) as CurrentPricesResponse;

        if (!candleResponse.ok) {
          throw new Error(
            candleJson.errors?.join("\n") ||
              `Candle API HTTP ${candleResponse.status}`,
          );
        }

        if (!priceResponse.ok) {
          throw new Error(
            priceJson.errors?.join("\n") ||
              `Price API HTTP ${priceResponse.status}`,
          );
        }

        if (!cancelled) {
          setData(candleJson);
          setPrices(priceJson);

          const errors = [
            ...(candleJson.errors ?? []),
            ...(priceJson.errors ?? []),
          ];
          setError(errors.join("\n"));
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : "Unknown error",
          );
          setLoading(false);
        }
      }
    };

    load();

    const timer = window.setInterval(
      load,
      Number(
        process.env.NEXT_PUBLIC_CANDLE_REFRESH_MS ?? 15000,
      ),
    );

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const analysis = useMemo(
    () =>
      analyzeOpportunity({
        bitpinCandles: data?.bitpin ?? [],
        wallexCandles: data?.wallex ?? [],
        currentPrices: {
          bitpin: prices?.bitpin ?? null,
          wallex: prices?.wallex ?? null,
        },
        externalPrice: externalPrice.trim()
          ? Number(externalPrice)
          : null,
        nowMs: Date.now(),
      }),
    [data, prices, externalPrice],
  );

  return (
    <main>
      <header>
        <div>
          <h1>Tether / Toman</h1>
          <div className="subtitle">
            Bitpin vs Wallex · 1 minute candles
          </div>
        </div>
        <div className="badge">
          {loading
            ? "Loading…"
            : `Updated ${prices ? new Date(prices.fetchedAt).toLocaleTimeString() : "—"}`}
        </div>
      </header>

      <section className="grid">
        <article className="card">
          <div className="cardHead">
            <div>
              <div className="exchange">Bitpin</div>
              <div className="symbol">Current Market Price</div>
            </div>
            <div className="status">
              {prices?.bitpin
                ? prices.bitpin.toLocaleString("en-US")
                : "—"}
            </div>
          </div>
          <div className="chartPriceNote">
            Current ticker price is independent from the 1m candle close.
          </div>
          <CandleChart candles={data?.bitpin ?? []} />
        </article>

        <article className="card">
          <div className="cardHead">
            <div>
              <div className="exchange">Wallex</div>
              <div className="symbol">Current Market Price</div>
            </div>
            <div className="status">
              {prices?.wallex
                ? prices.wallex.toLocaleString("en-US")
                : "—"}
            </div>
          </div>
          <div className="chartPriceNote">
            Current ticker price is independent from the 1m candle close.
          </div>
          <CandleChart candles={data?.wallex ?? []} />
        </article>
      </section>

      <div className="candleDataBadge">
        Historical 1m Candle Data · Bitpin: {data?.bitpin.length ?? 0} ·
        Wallex: {data?.wallex.length ?? 0}
      </div>

      <OpportunityPanel
        analysis={analysis}
        externalPrice={externalPrice}
        onExternalPriceChange={setExternalPrice}
      />

      {error && <div className="error">{error}</div>}
      <div className="footer">
        Phase 2 provides historical opportunity/stability analysis; it
        does not execute trades or guarantee outcomes.
      </div>
    </main>
  );
}
