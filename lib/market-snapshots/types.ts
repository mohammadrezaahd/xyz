import type { ObjectId } from "mongodb";
import type { OpportunityAnalysis } from "../opportunity/types";

export const MARKET_SNAPSHOT_VERSION = "1";

export type MarketSnapshotTrend =
  | "STRONGLY_BULLISH"
  | "BULLISH"
  | "STABLE"
  | "BEARISH"
  | "STRONGLY_BEARISH";

export type MarketSnapshot = {
  _id?: ObjectId;
  snapshotVersion: typeof MARKET_SNAPSHOT_VERSION;
  createdAt: Date;
  market: "USDT_TOMAN";
  trend: MarketSnapshotTrend;
  spreadPct: number | null;
  stability: number;
  confidence: number;
  netEdgePct: number | null;
  analysis: OpportunityAnalysis;
};
