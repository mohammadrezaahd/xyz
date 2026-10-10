import { NextResponse } from "next/server";
import { dedupeSort, type Candle } from "@/lib/candles";
import { buildLiveForecast } from "@/lib/research/forecast";
import { loadCandleHistory } from "@/lib/candle-history";

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
    const forecast = buildLiveForecast(dedupeSort(payload.bitpin ?? []), dedupeSort(payload.wallex ?? []));
    return NextResponse.json({
      ok: true,
      providerStatus: payload.providers ?? {},
      providerErrors: payload.errors ?? [],
      candleDiagnostics: payload.diagnostics ?? {},
      marketDataFetchedAt: payload.fetchedAt ?? null,
      ...forecast,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Forecast calculation failed",
    }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
