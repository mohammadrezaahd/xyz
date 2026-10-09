export type VenueQuote = {
  price: number | null;
  fetchedAt: number | null;
  bid: number | null;
  ask: number | null;
  provider: string;
  error: string | null;
};

export type MarketQuotes = {
  bitpin: VenueQuote;
  wallex: VenueQuote;
  external: {
    price: number | null;
    fetchedAt: number | null;
    provider: string | null;
    error: string | null;
  };
};

export function quoteAgeMs(fetchedAt: number | null | undefined, nowMs: number): number | null {
  if (!Number.isFinite(fetchedAt) || (fetchedAt as number) > nowMs) return null;
  return Math.max(0, nowMs - (fetchedAt as number));
}
