import { parsePositivePrice } from "./prices";

type JsonRecord = Record<string, unknown>;
type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

function record(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null ? value as JsonRecord : null;
}

function priceFromPublicMarkets(payload: unknown, symbol: string): number | null {
  const root = record(payload);
  const result = record(root?.result);
  const symbols = record(result?.symbols);
  const market = record(symbols?.[symbol]);
  const stats = record(market?.stats);
  return parsePositivePrice(stats?.lastPrice);
}

function priceFromOtcMarkets(payload: unknown, symbol: string): number | null {
  const root = record(payload);
  const result = record(root?.result);
  const market = record(result?.[symbol]);
  const stats = record(market?.stats);
  return parsePositivePrice(stats?.lastPrice);
}

async function requestJson(
  url: URL,
  options: { apiKey?: string; timeoutMs: number; fetchImpl: FetchLike },
): Promise<unknown> {
  const response = await options.fetchImpl(url, {
    method: "GET",
    cache: "no-store",
    signal: AbortSignal.timeout(options.timeoutMs),
    headers: options.apiKey ? { "x-api-key": options.apiKey } : undefined,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Wallex ticker HTTP ${response.status}`);
  }
  return payload;
}

async function attempt(
  url: URL,
  options: { apiKey?: string; timeoutMs: number; fetchImpl: FetchLike },
  parsePrice: (payload: unknown, symbol: string) => number | null,
  symbol: string,
): Promise<number> {
  const payload = await requestJson(url, options);
  const price = parsePrice(payload, symbol);
  if (price === null) throw new Error("Wallex ticker response has no valid USDTTMN lastPrice");
  return price;
}

export async function fetchWallexTickerPrice(options: {
  baseUrl?: string;
  symbol?: string;
  apiKey?: string;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
} = {}): Promise<number> {
  const baseUrl = (options.baseUrl ?? "https://api.wallex.ir").replace(/\/$/, "");
  const symbol = options.symbol ?? "USDTTMN";
  const apiKey = options.apiKey?.trim();
  const configuredTimeout = options.timeoutMs ?? 4_500;
  const timeoutMs = Number.isFinite(configuredTimeout)
    ? Math.min(6_000, Math.max(1_500, configuredTimeout))
    : 4_500;
  const fetchImpl = options.fetchImpl ?? fetch;
  const publicUrl = new URL(`${baseUrl}/v1/markets`);
  const errors: string[] = [];

  // Prefer public spot market data; it does not require an API key.
  for (let attemptNumber = 0; attemptNumber < 2; attemptNumber += 1) {
    try {
      return await attempt(publicUrl, { timeoutMs, fetchImpl }, priceFromPublicMarkets, symbol);
    } catch (error) {
      errors.push(`public market attempt ${attemptNumber + 1}: ${error instanceof Error ? error.message : String(error)}`);
      if (attemptNumber === 0) await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  // If public data is unavailable, use authenticated OTC as a bounded fallback.
  if (apiKey) {
    try {
      const otcUrl = new URL(`${baseUrl}/v1/otc/markets`);
      return await attempt(otcUrl, { apiKey, timeoutMs, fetchImpl }, priceFromOtcMarkets, symbol);
    } catch (error) {
      errors.push(`OTC fallback: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`Unable to fetch Wallex ${symbol} ticker. ${errors.join(" | ")}`);
}
