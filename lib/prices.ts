export interface CurrentPricesResponse {
  bitpin: number | null;
  wallex: number | null;
  fetchedAt: number;
  providers?: {
    bitpin: { status: "SUCCESS" | "FAILED"; fetchedAt: number | null; durationMs: number | null };
    wallex: { status: "SUCCESS" | "FAILED"; fetchedAt: number | null; durationMs: number | null };
  };
  errors: string[];
}

export function parsePositivePrice(value: unknown): number | null {
  const price = typeof value === "number" ? value : Number(value);
  return Number.isFinite(price) && price > 0 ? price : null;
}
