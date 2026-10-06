import { parsePositivePrice } from "./prices";
export async function fetchBitpinPrice(): Promise<number> {
  const base = process.env.BITPIN_API_BASE_URL?.trim(); const symbol = process.env.BITPIN_SYMBOL?.trim();
  if (!base || !symbol) throw new Error("Bitpin provider is not configured");
  const url = new URL(`${base.replace(/\/$/, "")}/api/v1/mkt/tickers/`); url.searchParams.set("symbol", symbol);
  const response = await fetch(url, { cache: "no-store" }); const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Bitpin ticker HTTP ${response.status}`);
  const rows = Array.isArray(payload) ? payload : payload && typeof payload === "object" ? (payload as any).results ?? (payload as any).data : null;
  const row = Array.isArray(rows) ? rows.find((item:any) => String(item?.symbol ?? item?.code ?? "") === symbol) : null;
  const price = parsePositivePrice(row?.price); if (price === null) throw new Error("Bitpin ticker response did not contain a valid price"); return price;
}
