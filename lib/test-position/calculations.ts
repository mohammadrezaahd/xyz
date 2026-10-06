import type {
  TestPositionExitReason,
  TestPositionLeverage,
  TestPositionResult,
} from "./types";
import {
  TEST_POSITION_DEFAULT_LEVERAGE,
  TEST_POSITION_INITIAL_CAPITAL,
  TEST_POSITION_LEVERAGES,
  TEST_POSITION_TAKER_FEE_PCT,
} from "./types";

export type PositionTerms = {
  initialCapital: number;
  margin: number;
  leverage: TestPositionLeverage;
  leveragedCredit: number;
  positionNotional: number;
  usdtQuantity: number;
  entryFeePct: number;
  exitFeePct: number;
  entryFee: number;
  liquidationPrice: number;
  breakEvenPrice: number;
};

function assertPositiveFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(name + " must be a positive finite number");
  }
}

export function isSupportedLeverage(
  value: number,
): value is TestPositionLeverage {
  return TEST_POSITION_LEVERAGES.includes(value as TestPositionLeverage);
}

export function assertSupportedLeverage(
  value: number,
): asserts value is TestPositionLeverage {
  if (!Number.isFinite(value) || !isSupportedLeverage(value)) {
    throw new Error("Leverage must be exactly 5x, 10x, or 20x");
  }
}

export function createPositionTerms(
  entryPrice: number,
  initialCapital = TEST_POSITION_INITIAL_CAPITAL,
  leverage: TestPositionLeverage = TEST_POSITION_DEFAULT_LEVERAGE,
): PositionTerms {
  assertPositiveFinite(entryPrice, "entryPrice");
  assertPositiveFinite(initialCapital, "initialCapital");
  assertSupportedLeverage(leverage);

  const leveragedCredit = initialCapital * leverage;
  const positionNotional = initialCapital + leveragedCredit;
  const entryFeePct = TEST_POSITION_TAKER_FEE_PCT;
  const exitFeePct = TEST_POSITION_TAKER_FEE_PCT;
  const entryFee = positionNotional * (entryFeePct / 100);
  const usdtQuantity = positionNotional / entryPrice;

  // Liquidation is reached when adverse gross PnL consumes the user's margin.
  // For LONG this boundary is below entry and equals:
  // entryPrice * (1 - initialCapital / positionNotional).
  const liquidationPrice =
    entryPrice * (1 - initialCapital / positionNotional);
  const breakEvenPrice = entryPrice * (1 + entryFeePct / 100) / (1 - exitFeePct / 100);

  return {
    initialCapital,
    margin: initialCapital,
    leverage,
    leveragedCredit,
    positionNotional,
    usdtQuantity,
    entryFeePct,
    exitFeePct,
    entryFee,
    liquidationPrice,
    breakEvenPrice,
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

  return positionNotional * ((currentPrice - entryPrice) / entryPrice);
}

export function calculateExitFee(
  entryPrice: number,
  exitPrice: number,
  positionNotional: number,
  exitFeePct: number,
): number {
  assertPositiveFinite(entryPrice, "entryPrice");
  assertPositiveFinite(exitPrice, "exitPrice");
  assertPositiveFinite(positionNotional, "positionNotional");
  assertPositiveFinite(exitFeePct, "exitFeePct");

  const exitNotional = positionNotional * (exitPrice / entryPrice);
  return exitNotional * (exitFeePct / 100);
}

export type PositionMark = {
  grossPnl: number;
  estimatedExitFee: number;
  totalFees: number;
  netPnl: number;
  roi: number;
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
  const roi = netPnl / position.initialCapital * 100;

  return {
    grossPnl,
    estimatedExitFee,
    totalFees,
    netPnl,
    roi,
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
  grossPnl: number,
  initialCapital: number,
): boolean {
  assertPositiveFinite(initialCapital, "initialCapital");
  return Number.isFinite(grossPnl) && grossPnl <= -initialCapital;
}

export function classifyClosedResult(
  entryPrice: number,
  targetPrice: number,
  exitPrice: number,
  exitReason: TestPositionExitReason,
): TestPositionResult {
  if (exitReason === "LIQUIDATION") return "LIQUIDATED";
  if (exitReason === "TARGET_REACHED") return "PREDICT_SUCCESS";

  if (exitPrice > entryPrice) return "RELATIVELY_SUCCESSFUL";
  return "FAILED";
}
