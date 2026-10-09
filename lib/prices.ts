export interface CurrentPricesResponse {
  bitpin: number | null;
  wallex: number | null;
  fetchedAt: number;
  bitpinQuote?: { price: number | null; fetchedAt: number | null; bid: number | null; ask: number | null; provider: string; error: string | null };
  wallexQuote?: { price: number | null; fetchedAt: number | null; bid: number | null; ask: number | null; provider: string; error: string | null };
  externalReference?: { price: number | null; fetchedAt: number | null; provider: string | null; error: string | null };
  errors: string[];
}

export function parsePositivePrice(value: unknown): number | null {
  const price = typeof value === "number" ? value : Number(value);
  return Number.isFinite(price) && price > 0 ? price : null;
}
