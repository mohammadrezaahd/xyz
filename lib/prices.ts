export interface CurrentPricesResponse {
  bitpin: number | null;
  wallex: number | null;
  fetchedAt: number;
  errors: string[];
}

export function parsePositivePrice(value: unknown): number | null {
  const price = typeof value === "number" ? value : Number(value);
  return Number.isFinite(price) && price > 0 ? price : null;
}
