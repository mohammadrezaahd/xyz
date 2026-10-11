import { NextResponse } from "next/server";
import { dedupeSort, parseCandles, type Candle } from "@/lib/candles";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function loadBitpin(from: number, to: number): Promise<Candle[]> {
  const base = process.env.BITPIN_API_BASE_URL?.trim();
  const configuredUrl = process.env.BITPIN_CANDLES_URL?.trim();
  const symbol = process.env.BITPIN_SYMBOL?.trim() || "USDT_IRT";
  if (!base && !configuredUrl) throw new Error("Bitpin candles URL is not configured");
  const url = new URL(configuredUrl || base!.replace(/\/$/, "") + "/v1/mkt/tv/get_bars/");
  url.searchParams.set(process.env.BITPIN_CANDLES_SYMBOL_PARAM || "symbol", symbol);
  url.searchParams.set(process.env.BITPIN_CANDLES_RESOLUTION_PARAM || "res", "60");
  url.searchParams.set(process.env.BITPIN_CANDLES_FROM_PARAM || "from", String(from));
  url.searchParams.set(process.env.BITPIN_CANDLES_TO_PARAM || "to", String(to));
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("Bitpin HTTP " + response.status);
  return dedupeSort(parseCandles(await response.json()));
}

async function loadWallex(from: number, to: number): Promise<Candle[]> {
  const url = new URL(process.env.WALLEX_CANDLES_URL || "https://api.wallex.ir/v1/udf/history");
  url.searchParams.set("symbol", process.env.WALLEX_SYMBOL || "USDTTMN");
  url.searchParams.set("resolution", "60");
  url.searchParams.set("from", String(from));
  url.searchParams.set("to", String(to));
  const headers: Record<string, string> = {};
  if (process.env.WALLEX_API_KEY) headers["x-api-key"] = process.env.WALLEX_API_KEY;
  const response = await fetch(url, { headers, cache: "no-store" });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error("Wallex HTTP " + response.status);
  if (payload?.s === "error") throw new Error(payload?.errmsg || "Wallex returned an error");
  if (payload?.s === "no_data") return [];
  return dedupeSort(parseCandles(payload));
}

export async function GET() {
  const to = Math.floor(Date.now() / 1000);
  const from = to - 90 * 24 * 60 * 60;
  const [bitpinResult, wallexResult] = await Promise.allSettled([loadBitpin(from, to), loadWallex(from, to)]);
  const bitpin = bitpinResult.status === "fulfilled" ? bitpinResult.value : [];
  const wallex = wallexResult.status === "fulfilled" ? wallexResult.value : [];
  const errors = [
    ...(bitpinResult.status === "rejected" ? ["Bitpin: " + String(bitpinResult.reason)] : []),
    ...(wallexResult.status === "rejected" ? ["Wallex: " + String(wallexResult.reason)] : []),
  ];
  return NextResponse.json({ bitpin, wallex, errors, fetchedAt: Date.now(), resolution: "60", rangeDays: 90 }, {
    status: bitpin.length || wallex.length ? 200 : 502,
    headers: { "Cache-Control": "no-store" },
  });
}
