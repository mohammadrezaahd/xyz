import { NextResponse } from "next/server";
import { dedupeSort, parseCandles, type Candle } from "@/lib/candles";

const env = (key: string, fallback = "") => process.env[key] ?? fallback;

async function fetchBitpin(): Promise<Candle[]> {
  const url = new URL(env("BITPIN_CANDLES_URL"));
  const now = Math.floor(Date.now() / 1000);
  const resolution = env("BITPIN_RESOLUTION", "1");
  const initialDays = Number(env("BITPIN_INITIAL_DAYS", "7"));
  const maxBars = Number(env("BITPIN_MAX_BARS", "10000"));

  const resolutionSeconds: Record<string, number> = {
    "1": 60, "5": 300, "15": 900, "30": 1800,
    "60": 3600, "240": 14400, "1D": 86400, "1W": 604800,
  };

  const stepSeconds = resolutionSeconds[resolution];
  if (!stepSeconds) throw new Error(`Unsupported Bitpin resolution: ${resolution}`);

  // Bitpin counts both endpoints, so N bars need (N - 1) intervals.
  const requestedSeconds = Math.max(1, initialDays) * 86400;
  const maxRangeSeconds = Math.max(0, maxBars - 1) * stepSeconds;
  const from = now - Math.min(requestedSeconds, maxRangeSeconds);

  url.searchParams.set(env("BITPIN_CANDLES_SYMBOL_PARAM", "symbol"), env("BITPIN_SYMBOL", "USDT_IRT"));
  url.searchParams.set(env("BITPIN_CANDLES_RESOLUTION_PARAM", "res"), resolution);
  url.searchParams.set(env("BITPIN_CANDLES_FROM_PARAM", "from"), String(from));
  url.searchParams.set(env("BITPIN_CANDLES_TO_PARAM", "to"), String(now));

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Bitpin HTTP ${response.status}: ${body}`);
  }

  return dedupeSort(parseCandles(await response.json()));
}

async function fetchWallex(): Promise<Candle[]> {
  const url = new URL(env("WALLEX_CANDLES_URL", "https://api.wallex.ir/v1/udf/history"));
  const now = Math.floor(Date.now() / 1000);
  const days = Number(env("WALLEX_INITIAL_DAYS", "20"));

  url.searchParams.set("symbol", env("WALLEX_SYMBOL", "USDTTMN"));
  url.searchParams.set("resolution", env("WALLEX_RESOLUTION", "1"));
  url.searchParams.set("from", String(now - days * 86400));
  url.searchParams.set("to", String(now));

  const headers: Record<string, string> = {};
  if (env("WALLEX_API_KEY")) headers["x-api-key"] = env("WALLEX_API_KEY");

  const response = await fetch(url, { headers, cache: "no-store" });
  if (!response.ok) throw new Error(`Wallex HTTP ${response.status}`);

  const payload = await response.json();
  if (payload?.s === "error") throw new Error(payload?.errmsg ?? "Wallex returned an error");

  return dedupeSort(parseCandles(payload));
}

export async function GET() {
  const [bitpin, wallex] = await Promise.allSettled([fetchBitpin(), fetchWallex()]);
  const errors: string[] = [];

  const bitpinData = bitpin.status === "fulfilled"
    ? bitpin.value
    : (errors.push(`Bitpin: ${String(bitpin.reason)}`), []);

  const wallexData = wallex.status === "fulfilled"
    ? wallex.value
    : (errors.push(`Wallex: ${String(wallex.reason)}`), []);

  return NextResponse.json({
    bitpin: bitpinData,
    wallex: wallexData,
    errors,
    fetchedAt: Date.now(),
    refreshMs: Number(env("CANDLE_REFRESH_MS", "15000")),
  });
}
