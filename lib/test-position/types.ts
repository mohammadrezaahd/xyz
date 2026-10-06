import type { ObjectId } from "mongodb";

export const TEST_POSITION_INITIAL_CAPITAL = 1_000_000;
export const TEST_POSITION_DEFAULT_LEVERAGE = 20;
export const TEST_POSITION_TAKER_FEE_PCT = 0.35;
export const TEST_POSITION_MAKER_FEE_PCT = 0.30;

export type TestPositionDirection = "SHORT";
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

export type PredictionSnapshot = {
  opportunityStrength: string;
  direction: TestPositionDirection;
  score: number;
  entry: {
    price: number;
    source: "bitpin";
  };
  target: {
    price: number;
    source: "phase-2-safe-target";
  };
  market: {
    bitpinPrice: number;
    wallexPrice: number;
    spreadPct: number;
  };
  validation: Record<
    string,
    {
      status: string;
      actual: number | null;
      threshold: number | null;
    }
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

export type TestPositionDocument = {
  _id?: ObjectId;
  opportunityId: ObjectId;
  status: TestPositionStatus;
  result: TestPositionResult | null;
  direction: TestPositionDirection;
  entryPrice: number;
  targetPrice: number;
  liquidationPrice: number;
  exitPrice: number | null;
  initialCapital: number;
  leverage: number;
  leveragedCredit: number;
  positionNotional: number;
  entryFeePct: number;
  exitFeePct: number;
  entryFee: number;
  exitFee: number | null;
  totalFees: number;
  grossPnl: number;
  netPnl: number;
  opportunityStrength: string;
  predictionSnapshot: PredictionSnapshot;
  entryAt: Date;
  closedAt: Date | null;
  exitReason: TestPositionExitReason | null;
  monitoring: {
    currentBitpinPrice: number | null;
    lastCheckedAt: Date | null;
    lastError: string | null;
  };
  createdAt: Date;
  updatedAt: Date;
};
