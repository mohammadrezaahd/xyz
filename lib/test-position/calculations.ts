import type { TestPositionExitReason, TestPositionResult } from "./types";

import {
  TEST_POSITION_DEFAULT_LEVERAGE,
  TEST_POSITION_INITIAL_CAPITAL,
  TEST_POSITION_TAKER_FEE_PCT,
} from "./types";

export type PositionTerms = {
  initialCapital: number;
  margin: number;
  leverage: number;
  leveragedCredit: number;
  positionNotional: number;
  entryFeePct: number;
  exitFeePct: number;
  entryFee: number;
  liquidationPrice: number;
};

function assertPositiveFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive finite number`);
  }
}

export function createPositionTerms(
  entryPrice: number,
  initialCapital = TEST_POSITION_INITIAL_CAPITAL,
  leverage = TEST_POSITION_DEFAULT_LEVERAGE,
): PositionTerms {
  assertPositiveFinite(entryPrice, "entryPrice");
  assertPositiveFinite(initialCapital, "initialCapital");
  assertPositiveFinite(leverage, "leverage");

  const leveragedCredit = initialCapital * leverage;
  const positionNotional = initialCapital + leveragedCredit;
  const entryFeePct = TEST_POSITION_TAKER_FEE_PCT;
  const exitFeePct = TEST_POSITION_TAKER_FEE_PCT;
  const entryFee = positionNotional * (entryFeePct / 100);

  // This is the exact price boundary implied by:
  // initialCapital - entryFee + grossPnl - estimatedExitFee = initialCapital.
  // See the Phase 4 business-rule note about the resulting boundary.
  const liquidationPrice =
    (entryPrice * (1 - entryFeePct / 100)) /
    (1 + exitFeePct / 100);

  return {
    initialCapital,
    margin: initialCapital,
    leverage,
    leveragedCredit,
    positionNotional,
    entryFeePct,
    exitFeePct,
    entryFee,
    liquidationPrice,
  };
}

export function calculateGrossPnl(
  entryPrice: number,
  currentPrice: number,
  positionNotional: number,
): number {
  assertPositiveFinite(entryPrice, "entryPrice");
  assertPositiveFinite(currentPrice, "currentPrice");
  assertPositiveFinite(positionNotional, "positionNotional");

  return positionNotional * ((entryPrice - currentPrice) / entryPrice);
}

export function calculateExitFee(
  entryPrice: number,
  currentPrice: number,
  positionNotional: number,
  exitFeePct: number,
): number {
  assertPositiveFinite(entryPrice, "entryPrice");
  assertPositiveFinite(currentPrice, "currentPrice");
  assertPositiveFinite(positionNotional, "positionNotional");
  assertPositiveFinite(exitFeePct, "exitFeePct");

  const exitNotional = positionNotional * (currentPrice / entryPrice);
  return exitNotional * (exitFeePct / 100);
}

export type PositionMark = {
  grossPnl: number;
  estimatedExitFee: number;
  totalFees: number;
  netPnl: number;
  currentEquity: number;
};

export function markPosition(
  position: Pick<
    PositionTerms,
    "initialCapital" | "positionNotional" | "entryFee" | "exitFeePct"
  > & { entryPrice: number },
  currentPrice: number,
): PositionMark {
  const grossPnl = calculateGrossPnl(
    position.entryPrice,
    currentPrice,
    position.positionNotional,
  );
  const estimatedExitFee = calculateExitFee(
    position.entryPrice,
    currentPrice,
    position.positionNotional,
    position.exitFeePct,
  );
  const totalFees = position.entryFee + estimatedExitFee;
  const netPnl = grossPnl - totalFees;
  const currentEquity =
    position.initialCapital + grossPnl - totalFees;

  return {
    grossPnl,
    estimatedExitFee,
    totalFees,
    netPnl,
    currentEquity,
  };
}

export function calculateNetPnl(
  entryPrice: number,
  currentPrice: number,
  positionNotional: number,
  entryFee: number,
  exitFeePct: number,
  initialCapital = positionNotional,
): PositionMark {
  return markPosition(
    {
      entryPrice,
      positionNotional,
      entryFee,
      exitFeePct,
      initialCapital,
    },
    currentPrice,
  );
}

export function isLiquidationConditionMet(
  currentEquity: number,
  initialCapital: number,
): boolean {
  assertPositiveFinite(initialCapital, "initialCapital");
  return Number.isFinite(currentEquity) && currentEquity < initialCapital;
}

export function classifyClosedResult(
  entryPrice: number,
  targetPrice: number,
  exitPrice: number,
  exitReason: TestPositionExitReason,
): TestPositionResult {
  if (exitReason === "LIQUIDATION") return "LIQUIDATED";
  if (exitReason === "TARGET_REACHED") return "PREDICT_SUCCESS";
  if (exitPrice < entryPrice && exitPrice > targetPrice) {
    return "RELATIVELY_SUCCESSFUL";
  }
  return "FAILED";
}
