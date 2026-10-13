import { NextResponse } from "next/server";
import { dedupeSort, type Candle } from "@/lib/candles";
import { loadCandleHistory } from "@/lib/candle-history";
import { runOpeningBacktest } from "@/lib/research/opening-backtest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const payload = await loadCandleHistory() as { bitpin?: Candle[]; providers?: Record<string,string>; errors?: string[]; fetchedAt?: number };
    const cost = Number(process.env.RESEARCH_BACKTEST_ROUND_TRIP_COST_PCT ?? "0.2");
    const result = runOpeningBacktest(dedupeSort(payload.bitpin ?? []), cost);
    return NextResponse.json({ ok: true, marketDataFetchedAt: payload.fetchedAt ?? null, providerStatus: payload.providers ?? {}, providerErrors: payload.errors ?? [], warning: "Small samples are descriptive, not proof of a profitable edge. Configure round-trip fees and slippage before interpreting net returns.", ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Opening backtest failed" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
