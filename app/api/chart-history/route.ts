import { NextResponse } from "next/server";
import { dedupeSort, parseCandles, type Candle } from "@/lib/candles";
import { getMarketAsset } from "@/lib/market-assets";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DAY_SECONDS = 24 * 60 * 60;
const WALLEX_CHUNK_DAYS = 7;

async function loadBitpin(from: number, to: number, symbol: string): Promise<Candle[]> {
  const base = process.env.BITPIN_API_BASE_URL?.trim();
  const configuredUrl = process.env.BITPIN_CANDLES_URL?.trim();
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

async function loadWallexChunk(from: number, to: number, symbol: string): Promise<Candle[]> {
  const url = new URL(process.env.WALLEX_CANDLES_URL || "https://api.wallex.ir/v1/udf/history");
  url.searchParams.set("symbol", symbol);
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

async function loadWallex(from: number, to: number, symbol: string): Promise<Candle[]> {
  const chunks: Array<{ from: number; to: number }> = [];
  for (let start = from; start < to; start += WALLEX_CHUNK_DAYS * DAY_SECONDS) {
    chunks.push({ from: start, to: Math.min(start + WALLEX_CHUNK_DAYS * DAY_SECONDS, to) });
  }

  const candles: Candle[] = [];
  const errors: string[] = [];
  for (let index = 0; index < chunks.length; index += 4) {
    const batch = chunks.slice(index, index + 4);
    const results = await Promise.allSettled(batch.map((chunk) => loadWallexChunk(chunk.from, chunk.to, symbol)));
    results.forEach((result, batchIndex) => {
      if (result.status === "fulfilled") candles.push(...result.value);
      else errors.push(`Wallex chunk ${batch[index + batchIndex].from}-${batch[index + batchIndex].to}: ${String(result.reason)}`);
    });
  }

  if (candles.length === 0 && errors.length > 0) throw new Error(errors.join("; "));
  return dedupeSort(candles);
}

export async function GET(request: Request) {
  const market = getMarketAsset(new URL(request.url).searchParams.get("asset"));
  const to = Math.floor(Date.now() / 1000);
  const HISTORY_DAYS = 365;
  const from = to - HISTORY_DAYS * DAY_SECONDS;
  const [bitpinResult, wallexResult] = await Promise.allSettled([
    loadBitpin(from, to, market.bitpin),
    loadWallex(from, to, market.wallex),
  ]);
  const bitpin = bitpinResult.status === "fulfilled" ? bitpinResult.value : [];
  const wallex = wallexResult.status === "fulfilled" ? wallexResult.value : [];
  const errors = [
    ...(bitpinResult.status === "rejected" ? ["Bitpin: " + String(bitpinResult.reason)] : []),
    ...(wallexResult.status === "rejected" ? ["Wallex: " + String(wallexResult.reason)] : []),
  ];
  return NextResponse.json({ asset: market.asset, bitpin, wallex, errors, fetchedAt: Date.now(), resolution: "60", rangeDays: HISTORY_DAYS }, {
    status: bitpin.length || wallex.length ? 200 : 502,
    headers: { "Cache-Control": "no-store" },
  });
}
