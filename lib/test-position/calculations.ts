import {
  TEST_POSITION_DEFAULT_LEVERAGE,
  TEST_POSITION_INITIAL_CAPITAL,
  TEST_POSITION_TAKER_FEE_PCT,
} from "./types";

export type PositionTerms = {
  initialCapital: number;
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

  // This is the price boundary produced by the project's explicit
  // initial-position-value liquidation equation, including fees.
  const liquidationPrice =
    (entryPrice * (1 - entryFeePct / 100)) /
    (1 + exitFeePct / 100);

  return {
    initialCapital,
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

export function calculateNetPnl(
  entryPrice: number,
  currentPrice: number,
  positionNotional: number,
  entryFee: number,
  exitFeePct: number,
): {
  grossPnl: number;
  exitFee: number;
  totalFees: number;
  netPnl: number;
  currentNetPositionValue: number;
} {
  const grossPnl = calculateGrossPnl(
    entryPrice,
    currentPrice,
    positionNotional,
  );
  const exitFee = calculateExitFee(
    entryPrice,
    currentPrice,
    positionNotional,
    exitFeePct,
  );
  const totalFees = entryFee + exitFee;
  const netPnl = grossPnl - totalFees;
  const initialPositionValue = positionNotional;
  const currentNetPositionValue =
    initialPositionValue + grossPnl - totalFees;

  return {
    grossPnl,
    exitFee,
    totalFees,
    netPnl,
    currentNetPositionValue,
  };
}

export function isLiquidationConditionMet(
  entryPrice: number,
  currentPrice: number,
  positionNotional: number,
  entryFee: number,
  exitFeePct: number,
): boolean {
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) return false;

  const { currentNetPositionValue } = calculateNetPnl(
    entryPrice,
    currentPrice,
    positionNotional,
    entryFee,
    exitFeePct,
  );

  // Phase 4 is SHORT-only. Keep liquidation on the adverse side of Entry
  // while applying the authoritative initial-position-value threshold.
  return (
    currentPrice > entryPrice &&
    currentNetPositionValue < positionNotional
  );
}

export function classifyClosedResult(
  entryPrice: number,
  targetPrice: number,
  exitPrice: number,
  exitReason: "TARGET_REACHED" | "MANUAL_CLOSE" | "LIQUIDATION",
): "PREDICT_SUCCESS" | "RELATIVELY_SUCCESSFUL" | "FAILED" | "LIQUIDATED" {
  if (exitReason === "LIQUIDATION") return "LIQUIDATED";
  if (exitPrice <= targetPrice) return "PREDICT_SUCCESS";

  if (exitPrice < entryPrice && exitPrice > targetPrice) {
    return "RELATIVELY_SUCCESSFUL";
  }

  return "FAILED";
}
