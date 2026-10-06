export const SIMULATION_MARGIN_TOMAN = 1_000_000;
export const SIMULATION_BORROWED_TOMAN = 10_000_000;
export const SIMULATION_NOTIONAL_TOMAN =
  SIMULATION_MARGIN_TOMAN + SIMULATION_BORROWED_TOMAN;
export const SIMULATION_LEVERAGE = 10;
export const SIMULATION_EFFECTIVE_LEVERAGE =
  SIMULATION_NOTIONAL_TOMAN / SIMULATION_MARGIN_TOMAN;

export const SIMULATION_TAKER_FEE_PCT = 0.35;
export const SIMULATION_MAINTENANCE_MARGIN_PCT = 0.5;

const TAKER_FEE_RATE = SIMULATION_TAKER_FEE_PCT / 100;
const MAINTENANCE_MARGIN_RATE =
  SIMULATION_MAINTENANCE_MARGIN_PCT / 100;

export type PositionSimulation = {
  marginToman: number;
  borrowedToman: number;
  notionalToman: number;
  leverage: number;
  effectiveLeverage: number;
  quantity: number;
  takerFeePct: number;
  entryFeeToman: number;
  maintenanceMarginPct: number;
  liquidationPrice: number;
  breakEvenPrice: number;
  strategyTargetPrice: number;
  targetPrice: number;
};

export type LeveragedPnl = {
  grossPnlToman: number;
  entryFeeToman: number;
  exitFeeToman: number;
  totalFeesToman: number;
  netPnlToman: number;
  netPnlPct: number;
};

export function calculateBreakEvenPrice(entryPrice: number): number {
  return (entryPrice * (1 + TAKER_FEE_RATE)) / (1 - TAKER_FEE_RATE);
}

/**
 * Isolated LONG liquidation:
 *
 * Q = notional / entry
 * entryFee = notional * feeRate
 * availableMargin = margin - entryFee
 *
 * At liquidation:
 * availableMargin - Q * (entry - liquidation)
 *   = Q * liquidation * maintenanceMarginRate
 *
 * Therefore:
 * liquidation =
 *   (Q * entry - availableMargin) /
 *   (Q * (1 - maintenanceMarginRate))
 */
export function calculateLiquidationPrice(entryPrice: number): number {
  const quantity = SIMULATION_NOTIONAL_TOMAN / entryPrice;
  const entryFeeToman = SIMULATION_NOTIONAL_TOMAN * TAKER_FEE_RATE;
  const availableMargin = SIMULATION_MARGIN_TOMAN - entryFeeToman;

  return (
    quantity * entryPrice - availableMargin
  ) / (quantity * (1 - MAINTENANCE_MARGIN_RATE));
}

export function createPositionSimulation(
  entryPrice: number,
  strategyTargetPrice: number,
): PositionSimulation {
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
    throw new Error("Cannot simulate a position without a valid entry price.");
  }

  if (!Number.isFinite(strategyTargetPrice) || strategyTargetPrice <= 0) {
    throw new Error("Cannot simulate a position without a valid target price.");
  }

  const quantity = SIMULATION_NOTIONAL_TOMAN / entryPrice;
  const entryFeeToman = SIMULATION_NOTIONAL_TOMAN * TAKER_FEE_RATE;
  const breakEvenPrice = calculateBreakEvenPrice(entryPrice);
  const targetPrice = Math.max(strategyTargetPrice, breakEvenPrice);

  return {
    marginToman: SIMULATION_MARGIN_TOMAN,
    borrowedToman: SIMULATION_BORROWED_TOMAN,
    notionalToman: SIMULATION_NOTIONAL_TOMAN,
    leverage: SIMULATION_LEVERAGE,
    effectiveLeverage: SIMULATION_EFFECTIVE_LEVERAGE,
    quantity,
    takerFeePct: SIMULATION_TAKER_FEE_PCT,
    entryFeeToman,
    maintenanceMarginPct: SIMULATION_MAINTENANCE_MARGIN_PCT,
    liquidationPrice: calculateLiquidationPrice(entryPrice),
    breakEvenPrice,
    strategyTargetPrice,
    targetPrice,
  };
}

export function calculateLeveragedPnl(
  entryPrice: number,
  exitPrice: number,
  simulation: PositionSimulation = createPositionSimulation(entryPrice, exitPrice),
): LeveragedPnl {
  const grossPnlToman =
    simulation.quantity * (exitPrice - entryPrice);
  const exitFeeToman = simulation.quantity * exitPrice * TAKER_FEE_RATE;
  const totalFeesToman = simulation.entryFeeToman + exitFeeToman;
  const netPnlToman = grossPnlToman - totalFeesToman;

  return {
    grossPnlToman,
    entryFeeToman: simulation.entryFeeToman,
    exitFeeToman,
    totalFeesToman,
    netPnlToman,
    netPnlPct: (netPnlToman / simulation.marginToman) * 100,
  };
}
