import { NextResponse } from "next/server";
import { dedupeSort, type Candle } from "@/lib/candles";
import { runResearchBacktest } from "@/lib/research/backtest";
import { loadCandleHistory } from "@/lib/candle-history";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type CandleResponse = {
  bitpin?: Candle[];
  wallex?: Candle[];
  errors?: string[];
  fetchedAt?: number;
  providers?: Record<string, string>;
  diagnostics?: Record<string, unknown>;
};

export async function GET(request: Request) {
  try {
    const payload = await loadCandleHistory() as CandleResponse;

    const bitpin = dedupeSort(payload.bitpin ?? []);
    const wallex = dedupeSort(payload.wallex ?? []);
    const cost = Number(process.env.RESEARCH_BACKTEST_ROUND_TRIP_COST_PCT ?? "0.2");
    if (!Number.isFinite(cost) || cost < 0) {
      return NextResponse.json({ error: "RESEARCH_BACKTEST_ROUND_TRIP_COST_PCT must be a non-negative percentage" }, { status: 500 });
    }

    const result = runResearchBacktest(bitpin, wallex, { costPerRoundTripPct: cost });
    return NextResponse.json({
      ok: true,
      marketDataFetchedAt: payload.fetchedAt ?? null,
      providerStatus: payload.providers ?? {},
      candleDiagnostics: payload.diagnostics ?? {},
      providerErrors: payload.errors ?? [],
      warning: "Research only. Results are historical, not a live prediction or guarantee. Configure RESEARCH_BACKTEST_ROUND_TRIP_COST_PCT to your actual round-trip fee/slippage assumptions before interpreting net results.",
      ...result,
      sampleCount: result.samples.length,
      samplesReturned: Math.min(100, result.samples.length),
      samples: result.samples.slice(-100),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Research backtest failed" }, { status: 500 });
  }
}
