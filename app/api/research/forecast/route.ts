import { NextResponse } from "next/server";
import { dedupeSort, type Candle } from "@/lib/candles";
import { buildLiveForecast } from "@/lib/research/forecast";

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

export async function GET(request: Request) {
  try {
    const origin = new URL(request.url).origin;
    const response = await fetch(new URL("/api/candles", origin), { cache: "no-store" });
    const payload = await response.json().catch(() => null) as CandlePayload | null;
    if (!response.ok || !payload) {
      return NextResponse.json({ ok: false, error: "Unable to load candle history", upstreamStatus: response.status }, { status: 502 });
    }
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
