export const MARKET_ASSETS = {
  USDT: { label: "USDT / Toman", bitpin: process.env.BITPIN_SYMBOL?.trim() || "USDT_IRT", wallex: process.env.WALLEX_SYMBOL?.trim() || "USDTTMN" },
  SOL: { label: "SOL / Toman", bitpin: "SOL_IRT", wallex: "SOLTMN" },
  ETH: { label: "ETH / Toman", bitpin: "ETH_IRT", wallex: "ETHTMN" },
  XRP: { label: "XRP / Toman", bitpin: "XRP_IRT", wallex: "XRPTMN" },
} as const;

export type MarketAsset = keyof typeof MARKET_ASSETS;
export function resolveMarketAsset(value: string | null | undefined): MarketAsset {
  const normalized = (value ?? "USDT").toUpperCase();
  return normalized in MARKET_ASSETS ? normalized as MarketAsset : "USDT";
}
export function getMarketAsset(value: string | null | undefined) {
  const asset = resolveMarketAsset(value);
  return { asset, ...MARKET_ASSETS[asset] };
}
