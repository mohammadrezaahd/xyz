import type { ObjectId } from "mongodb";
export type SignalStatus = "ACTIVE" | "TRACKED" | "TARGET_REACHED" | "STOPPED" | "EXPIRED" | "INVALIDATED";
export type SignalRisk = "ALL" | "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";
export type SignalDirection = "LONG" | "SHORT";
export type SignalDocument = {
  _id?: ObjectId; signalKey: string; status: SignalStatus; createdAt: Date; updatedAt: Date; detectedAt: Date; expiresAt: Date;
  sourceResearchObservationId: ObjectId | null; sourceOpportunityId: ObjectId | null; paperPositionId: ObjectId | null;
  direction: SignalDirection; riskLevel: Exclude<SignalRisk, "ALL">; opportunityStrength: string; stabilityScore: number; confidence: number;
  spreadPct: number | null; entryPrice: number; targetPrice: number; expectedProfit: number | null; expectedLoss: number | null;
  expectedNetPnl: number | null; expectedRoi: number | null; breakEvenPrice: number | null; liquidationPrice: number | null;
  currentPrice: number | null; lastCheckedAt: Date | null; lastError: string | null; resolvedAt: Date | null;
  actualExitPrice: number | null; actualResult: string | null; actualNetPnl: number | null; actualRoi: number | null;
  configurationVersion: string; engineVersion: string;
};
