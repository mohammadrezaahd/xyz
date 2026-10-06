import type { ObjectId } from "mongodb";

export const TEST_POSITION_INITIAL_CAPITAL = 1_000_000;
export const TEST_POSITION_DEFAULT_LEVERAGE = 20;
export const TEST_POSITION_TAKER_FEE_PCT = 0.35;
export const TEST_POSITION_MAKER_FEE_PCT = 0.30;
export const TEST_POSITION_LEVERAGES = [5, 10, 20] as const;
export type TestPositionLeverage = (typeof TEST_POSITION_LEVERAGES)[number];
export type TestPositionDirection = "LONG";
export type TestPositionStatus = "OPEN" | "CLOSED" | "LIQUIDATED";
export type TestPositionResult =
  | "PREDICT_SUCCESS"
  | "RELATIVELY_SUCCESSFUL"
  | "FAILED"
  | "LIQUIDATED";
export type TestPositionExitReason =
  | "TARGET_REACHED"
  | "MANUAL_CLOSE"
  | "LIQUIDATION";

export type OpportunitySnapshot = {
  opportunityId: ObjectId;
  opportunityStrength: string;
  direction: TestPositionDirection | "SHORT";
  score: number;
  suggestedEntryPrice: number;
  suggestedTargetPrice: number;
  riskLevel: string | null;
  market: {
    bitpinPrice: number;
    wallexPrice: number;
    spreadPct: number;
  };
  validation: Record<
    string,
    { status: string; actual: number | null; threshold: number | null }
  >;
  metrics: {
    bitpinBullishPct: number | null;
    wallexBullishPct: number | null;
    candleAlignmentPct: number | null;
    averageDirectionalMovePct: number | null;
    momentumScore: number | null;
  };
  detection: {
    detectedAt: Date;
    engineVersion: string;
  };
};

export type RiskSnapshot = {
  source: "OPPORTUNITY" | "MANUAL";
  capturedAt: Date;
  opportunityStrength: string | null;
  score: number | null;
  riskLevel: string | null;
  direction: TestPositionDirection;
};

export type TestPositionDocument = {
  _id?: ObjectId;
  opportunityId: ObjectId | null;
  status: TestPositionStatus;
  result: TestPositionResult | null;
  direction: TestPositionDirection;

  initialCapital: number;
  margin: number;
  leverage: TestPositionLeverage;
  leveragedCredit: number;
  positionNotional: number;
  usdtQuantity: number;

  entryPrice: number;
  targetPrice: number;
  liquidationPrice: number;

  entryFeePct: number;
  exitFeePct: number;
  entryFee: number;
  exitFee: number | null;
  totalFees: number;

  grossPnl: number;
  netPnl: number;
  currentPrice: number | null;
  currentEquity: number;

  exitPrice: number | null;
  exitReason: TestPositionExitReason | null;

  entryAt: Date;
  closedAt: Date | null;

  opportunitySnapshot: OpportunitySnapshot | null;
  riskSnapshot: RiskSnapshot;

  monitoring: {
    lastCheckedAt: Date | null;
    lastError: string | null;
  };

  createdAt: Date;
  updatedAt: Date;
};
