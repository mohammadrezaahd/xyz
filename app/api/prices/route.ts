import { NextResponse } from "next/server";
import { parsePositivePrice } from "@/lib/prices";
import { fetchWallexTickerPrice } from "@/lib/wallex-ticker";

const env = (key: string, fallback = "") => process.env[key] ?? fallback;

export const maxDuration = 30;

function requireEnv(key: string): string {
  const value = env(key).trim();
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

function findBitpinPrice(payload: unknown, symbol: string): number | null {
  const rows =
    Array.isArray(payload)
      ? payload
      : typeof payload === "object" && payload !== null
        ? ((payload as Record<string, unknown>).results ??
          (payload as Record<string, unknown>).data)
        : null;

  if (!Array.isArray(rows)) return null;

  const row = rows.find(
    (item) =>
      typeof item === "object" &&
      item !== null &&
      String((item as Record<string, unknown>).symbol ?? (item as Record<string, unknown>).code ?? "") === symbol,
  );

  if (!row || typeof row !== "object") return null;

  return parsePositivePrice((row as Record<string, unknown>).price);
}

async function fetchBitpinPrice(): Promise<number> {
  const baseUrl = requireEnv("BITPIN_API_BASE_URL").replace(/\/$/, "");
  const url = new URL(`${baseUrl}/api/v1/mkt/tickers/`);
  const symbol = requireEnv("BITPIN_SYMBOL");
  url.searchParams.set("symbol", symbol);

  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(`Bitpin ticker HTTP ${response.status}: ${JSON.stringify(payload)}`);
  }

  const price = findBitpinPrice(payload, symbol);
  if (price === null) {
    throw new Error("Bitpin ticker response did not contain a valid USDT_IRT price");
  }
  return price;
}

async function fetchWallexPrice(): Promise<number> {
  return fetchWallexTickerPrice({
    baseUrl: env("WALLEX_API_BASE_URL", "https://api.wallex.ir"),
    symbol: env("WALLEX_SYMBOL", "USDTTMN"),
    apiKey: env("WALLEX_API_KEY"),
    timeoutMs: Number(env("WALLEX_TICKER_TIMEOUT_MS", "4500")),
  });
}

type MeasuredPrice = { price: number; fetchedAt: number; durationMs: number };

async function measurePrice(fetcher: () => Promise<number>): Promise<MeasuredPrice> {
  const startedAt = Date.now();
  const price = await fetcher();
  const fetchedAt = Date.now();
  return { price, fetchedAt, durationMs: fetchedAt - startedAt };
}

export async function GET() {
  const [bitpin, wallex] = await Promise.allSettled([
    measurePrice(fetchBitpinPrice),
    measurePrice(fetchWallexPrice),
  ]);

  const errors: string[] = [];
  const bitpinPrice =
    bitpin.status === "fulfilled"
      ? bitpin.value.price
      : (errors.push(`Bitpin ticker: ${String(bitpin.reason)}`), null);
  const wallexPrice =
    wallex.status === "fulfilled"
      ? wallex.value.price
      : (errors.push(`Wallex ticker: ${String(wallex.reason)}`), null);

  return NextResponse.json({
    bitpin: bitpinPrice,
    wallex: wallexPrice,
    fetchedAt: Date.now(),
    providers: {
      bitpin: { status: bitpin.status === "fulfilled" ? "SUCCESS" : "FAILED", fetchedAt: bitpin.status === "fulfilled" ? bitpin.value.fetchedAt : null, durationMs: bitpin.status === "fulfilled" ? bitpin.value.durationMs : null },
      wallex: { status: wallex.status === "fulfilled" ? "SUCCESS" : "FAILED", fetchedAt: wallex.status === "fulfilled" ? wallex.value.fetchedAt : null, durationMs: wallex.status === "fulfilled" ? wallex.value.durationMs : null },
    },
    errors,
  });
}
