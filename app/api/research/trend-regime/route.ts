import { NextResponse } from "next/server";
import { dedupeSort, type Candle } from "@/lib/candles";
import { loadCandleHistory } from "@/lib/candle-history";
import { buildTrendRegime } from "@/lib/research/trend-regime";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type CandlePayload = {
  bitpin?: Candle[];
  wallex?: Candle[];
  errors?: string[];
  fetchedAt?: number;
  providers?: Record<string, string>;
  diagnostics?: Record<string, unknown>;
};

export async function GET() {
  try {
    const payload = await loadCandleHistory() as CandlePayload;
    const cost = Number(process.env.RESEARCH_BACKTEST_ROUND_TRIP_COST_PCT ?? "0.2");
    if (!Number.isFinite(cost) || cost < 0) {
      return NextResponse.json({ ok: false, error: "RESEARCH_BACKTEST_ROUND_TRIP_COST_PCT must be a non-negative percentage" }, { status: 500 });
    }
    const result = buildTrendRegime(dedupeSort(payload.bitpin ?? []), dedupeSort(payload.wallex ?? []), { costPerRoundTripPct: cost });
    return NextResponse.json({
      ok: true,
      providerStatus: payload.providers ?? {},
      providerErrors: payload.errors ?? [],
      candleDiagnostics: payload.diagnostics ?? {},
      marketDataFetchedAt: payload.fetchedAt ?? null,
      ...result,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Trend regime analysis failed",
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
