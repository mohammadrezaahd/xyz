"use client";

import { useEffect, useMemo, useState } from "react";
import { CandleChart } from "@/components/candle-chart";
import { OpportunityPanel } from "@/components/opportunity-panel";
import { Phase3Panel } from "@/components/phase3-panel";
import { TestPositionPanel } from "@/components/test-position-panel";
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

function formatPrice(value: number | null): string {
  return value === null
    ? "—"
    : value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function formatTime(value: number | undefined): string {
  return value ? new Date(value).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }) : "—";
}

function StatCard({
  label,
  value,
  helper,
  tone = "neutral",
}: {
  label: string;
  value: string;
  helper: string;
  tone?: "neutral" | "positive" | "negative" | "accent";
}) {
  return (
    <article className={`statCard statCard--${tone}`}>
      <div className="statCardLabel">{label}</div>
      <div className="statCardValue">{value}</div>
      <div className="statCardHelper">{helper}</div>
    </article>
  );
}

export default function Home() {
  const [data, setData] = useState<CandleResponse | null>(null);
  const [prices, setPrices] = useState<CurrentPricesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [externalPrice, setExternalPrice] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [candleResponse, priceResponse] = await Promise.all([
          fetch("/api/candles", { cache: "no-store" }),
          fetch("/api/prices", { cache: "no-store" }),
        ]);

        const candleJson = (await candleResponse.json()) as CandleResponse;
        const priceJson = (await priceResponse.json()) as CurrentPricesResponse;

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
          setError(e instanceof Error ? e.message : "Unknown error");
          setLoading(false);
        }
      }
    };

    load();

    const timer = window.setInterval(
      load,
      Number(process.env.NEXT_PUBLIC_CANDLE_REFRESH_MS ?? 15000),
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

  const spread = analysis.spread.percent;

  const hasMarketData = prices?.bitpin !== null && prices?.wallex !== null;

  return (
    <main className="dashboardShell">
      <header className="topbar">
        <div className="brandBlock">
          <div className="brandMark">X</div>
          <div>
            <div className="eyebrow">MARKET INTELLIGENCE</div>
            <h1>XYZ Exchange Monitor</h1>
            <p>Real-time Tether / Toman analysis across Bitpin and Wallex</p>
          </div>
        </div>

        <div className="topbarMeta">
          <div className={`livePill ${loading ? "isLoading" : ""}`}>
            <span className="liveDot" />
            {loading ? "Syncing market data" : "Live monitoring"}
          </div>
          <div className="updatedMeta">
            <span>Last update</span>
            <strong>{formatTime(prices?.fetchedAt)}</strong>
          </div>
        </div>
      </header>

      <section className="heroStrip">
        <div>
          <div className="heroKicker">1m MARKET SNAPSHOT</div>
          <h2>Spot spread and stability at a glance.</h2>
          <p>
            Historical candle analysis powers the opportunity model. This interface
            keeps decision-critical metrics visible without hiding the underlying detail.
          </p>
        </div>
        <div className="heroAside">
          <div className="heroAsideValue">{analysis.stabilityScore.toFixed(1)}</div>
          <div className="heroAsideLabel">Stability score / 100</div>
        </div>
      </section>

      <section className="statGrid" aria-label="Market summary">
        <StatCard
          label="Bitpin"
          value={formatPrice(prices?.bitpin ?? null)}
          helper="Current ticker price"
          tone="accent"
        />
        <StatCard
          label="Wallex"
          value={formatPrice(prices?.wallex ?? null)}
          helper="Current ticker price"
          tone="positive"
        />
        <StatCard
          label="Spread"
          value={spread === null ? "—" : `${spread.toFixed(2)}%`}
          helper={spread === null ? "Waiting for price data" : "Current exchange spread"}
          tone={spread !== null && spread > 0 ? "positive" : "neutral"}
        />
        <StatCard
          label="Opportunity"
          value={analysis.opportunity}
          helper={`Risk level: ${analysis.riskLevel}`}
          tone={analysis.opportunity === "STRONG" ? "positive" : "neutral"}
        />
      </section>

      <section className="sectionBlock">
        <div className="sectionHeading">
          <div>
            <div className="sectionKicker">EXCHANGE COMPARISON</div>
            <h2>Live candle streams</h2>
          </div>
          <div className="sectionMeta">
            <span className="statusDot" />
            {hasMarketData ? "Market data available" : "Waiting for market data"}
          </div>
        </div>

        <div className="chartGrid">
          <article className="marketCard">
            <div className="marketCardHead">
              <div className="exchangeIdentity">
                <div className="exchangeBadge exchangeBadge--bitpin">B</div>
                <div>
                  <h3>Bitpin</h3>
                  <span>1 minute candles</span>
                </div>
              </div>
              <div className="marketPrice">
                <span>Ticker</span>
                <strong>{formatPrice(prices?.bitpin ?? null)}</strong>
              </div>
            </div>
            <div className="chartContext">
              <span>Historical candle close is independent from ticker price.</span>
              <strong>{data?.bitpin.length ?? 0} candles</strong>
            </div>
            <CandleChart candles={data?.bitpin ?? []} />
          </article>

          <article className="marketCard">
            <div className="marketCardHead">
              <div className="exchangeIdentity">
                <div className="exchangeBadge exchangeBadge--wallex">W</div>
                <div>
                  <h3>Wallex</h3>
                  <span>1 minute candles</span>
                </div>
              </div>
              <div className="marketPrice">
                <span>Ticker</span>
                <strong>{formatPrice(prices?.wallex ?? null)}</strong>
              </div>
            </div>
            <div className="chartContext">
              <span>Historical candle close is independent from ticker price.</span>
              <strong>{data?.wallex.length ?? 0} candles</strong>
            </div>
            <CandleChart candles={data?.wallex ?? []} />
          </article>
        </div>
      </section>

      <OpportunityPanel
        analysis={analysis}
        externalPrice={externalPrice}
        onExternalPriceChange={setExternalPrice}
      />

      <Phase3Panel />

      <TestPositionPanel refreshKey={0} currentPrice={prices?.bitpin ?? null} />

      {error && (
        <section className="errorBanner" role="alert">
          <div className="errorBannerIcon">!</div>
          <div>
            <strong>Data provider warning</strong>
            <p>{error}</p>
          </div>
        </section>
      )}

      <footer className="dashboardFooter">
        <span>XYZ Market Intelligence</span>
        <span>Analysis only · no automated trading execution</span>
      </footer>
    </main>
  );
}
