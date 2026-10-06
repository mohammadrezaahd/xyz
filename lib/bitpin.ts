import { parsePositivePrice } from "./prices";

function requireEnv(key: string): string {
  const value = process.env[key]?.trim();
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
      String(
        (item as Record<string, unknown>).symbol ??
          (item as Record<string, unknown>).code ??
          "",
      ) === symbol,
  );

  if (!row || typeof row !== "object") return null;

  return parsePositivePrice((row as Record<string, unknown>).price);
}

export async function fetchBitpinPrice(): Promise<number> {
  const baseUrl = requireEnv("BITPIN_API_BASE_URL").replace(/\/$/, "");
  const url = new URL(`${baseUrl}/api/v1/mkt/tickers/`);
  const symbol = requireEnv("BITPIN_SYMBOL");
  url.searchParams.set("symbol", symbol);

  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      `Bitpin ticker HTTP ${response.status}: ${JSON.stringify(payload)}`,
    );
  }

  const price = findBitpinPrice(payload, symbol);
  if (price === null) {
    throw new Error("Bitpin ticker response did not contain a valid price");
  }

  return price;
}
