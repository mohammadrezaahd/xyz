import { NextResponse } from "next/server";
import { parsePositivePrice } from "@/lib/prices";

const env = (key: string) => process.env[key] ?? "";

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

  return parsePositivePrice(
    (row as Record<string, unknown>).price,
  );
}

async function fetchBitpinPrice(): Promise<number> {
  const baseUrl = requireEnv("BITPIN_API_BASE_URL").replace(/\/$/, "");
  const url = new URL(`${baseUrl}/api/v1/mkt/tickers/`);

  const symbol = requireEnv("BITPIN_SYMBOL");
  url.searchParams.set("symbol", symbol);

  const response = await fetch(url, {
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      `Bitpin ticker HTTP ${response.status}: ${JSON.stringify(payload)}`,
    );
  }

  const price = findBitpinPrice(payload, symbol);
  if (price === null) {
    throw new Error(
      "Bitpin ticker response did not contain a valid USDT_IRT price",
    );
  }

  return price;
}

async function fetchWallexPrice(): Promise<number> {
  const baseUrl = env(
    "WALLEX_API_BASE_URL",
    "https://api.wallex.ir",
  );
  const url = new URL(`${baseUrl}/v1/otc/markets`);
  const symbol = env("WALLEX_SYMBOL", "USDTTMN");
  const apiKey = env("WALLEX_API_KEY");

  if (!apiKey) {
    throw new Error("Wallex API key is not configured");
  }

  const response = await fetch(url, {
    headers: {
      "x-api-key": apiKey,
    },
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      `Wallex markets HTTP ${response.status}: ${JSON.stringify(payload)}`,
    );
  }

  const symbolData =
    typeof payload === "object" &&
    payload !== null &&
    typeof (payload as Record<string, unknown>).result === "object"
      ? (
          (payload as Record<string, unknown>).result as Record<
            string,
            unknown
          >
        )[symbol]
      : null;

  const stats =
    typeof symbolData === "object" &&
    symbolData !== null &&
    typeof (symbolData as Record<string, unknown>).stats === "object"
      ? (symbolData as Record<string, unknown>).stats
      : null;

  const price =
    typeof stats === "object" && stats !== null
      ? parsePositivePrice(
          (stats as Record<string, unknown>).lastPrice,
        )
      : null;

  if (price === null) {
    throw new Error(
      "Wallex markets response did not contain a valid USDTTMN lastPrice",
    );
  }

  return price;
}

export async function GET() {
  const [bitpin, wallex] = await Promise.allSettled([
    fetchBitpinPrice(),
    fetchWallexPrice(),
  ]);

  const errors: string[] = [];

  const bitpinPrice =
    bitpin.status === "fulfilled"
      ? bitpin.value
      : (errors.push(`Bitpin: ${String(bitpin.reason)}`), null);

  const wallexPrice =
    wallex.status === "fulfilled"
      ? wallex.value
      : (errors.push(`Wallex: ${String(wallex.reason)}`), null);

  return NextResponse.json({
    bitpin: bitpinPrice,
    wallex: wallexPrice,
    fetchedAt: Date.now(),
    errors,
  });
}
