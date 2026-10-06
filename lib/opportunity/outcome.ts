import {
  calculateLeveragedPnl,
  createPositionSimulation,
  type LeveragedPnl,
  type PositionSimulation,
} from "./position";

export type PositionDirection = "LONG" | "SHORT";
export type SyntheticOutcomeStatus =
  | "OPEN"
  | "SUCCESS"
  | "FAILED"
  | "INVALIDATED";

export type SyntheticOutcomeEvaluation = {
  status: SyntheticOutcomeStatus;
  exitPrice: number | null;
  priceChangePct: number | null;
  grossPnlToman: number | null;
  totalFeesToman: number | null;
  netPnlToman: number | null;
  netPnlPct: number | null;
  reason?: string;
};

function isValidStoredPrice(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function withPnl(
  entryPrice: number,
  exitPrice: number,
  simulation: PositionSimulation,
) {
  const pnl: LeveragedPnl = calculateLeveragedPnl(
    entryPrice,
    exitPrice,
    simulation,
  );

  return {
    grossPnlToman: pnl.grossPnlToman,
    totalFeesToman: pnl.totalFeesToman,
    netPnlToman: pnl.netPnlToman,
    netPnlPct: pnl.netPnlPct,
  };
}

export function evaluateSyntheticOutcome(
  entryPrice: number,
  strategyTargetPrice: number,
  currentPrice: number | null | undefined,
  direction: PositionDirection,
  simulation?: PositionSimulation,
): SyntheticOutcomeEvaluation {
  if (!isValidStoredPrice(entryPrice)) {
    return {
      status: "INVALIDATED",
      exitPrice: null,
      priceChangePct: null,
      grossPnlToman: null,
      totalFeesToman: null,
      netPnlToman: null,
      netPnlPct: null,
      reason: "Stored entry price is structurally invalid.",
    };
  }

  if (!isValidStoredPrice(strategyTargetPrice)) {
    return {
      status: "INVALIDATED",
      exitPrice: null,
      priceChangePct: null,
      grossPnlToman: null,
      totalFeesToman: null,
      netPnlToman: null,
      netPnlPct: null,
      reason: "Stored target price is structurally invalid.",
    };
  }

  if (
    typeof currentPrice !== "number" ||
    !Number.isFinite(currentPrice) ||
    currentPrice <= 0
  ) {
    return {
      status: "OPEN",
      exitPrice: null,
      priceChangePct: null,
      grossPnlToman: null,
      totalFeesToman: null,
      netPnlToman: null,
      netPnlPct: null,
      reason: "Current Bitpin price is unavailable or invalid.",
    };
  }

  if (direction !== "LONG" && direction !== "SHORT") {
    return {
      status: "INVALIDATED",
      exitPrice: null,
      priceChangePct: null,
      grossPnlToman: null,
      totalFeesToman: null,
      netPnlToman: null,
      netPnlPct: null,
      reason: "Unsupported position direction.",
    };
  }

  const activeSimulation =
    simulation ??
    createPositionSimulation(entryPrice, strategyTargetPrice);

  if (currentPrice >= activeSimulation.targetPrice) {
    const pnl = withPnl(entryPrice, currentPrice, activeSimulation);

    return {
      status: "SUCCESS",
      exitPrice: currentPrice,
      priceChangePct: ((currentPrice - entryPrice) / entryPrice) * 100,
      ...pnl,
      reason:
        currentPrice >= activeSimulation.breakEvenPrice
          ? "Leveraged simulation target reached after fees."
          : "Simulation target reached.",
    };
  }

  if (currentPrice <= activeSimulation.liquidationPrice) {
    const exitPrice = activeSimulation.liquidationPrice;
    const pnl = withPnl(entryPrice, exitPrice, activeSimulation);

    return {
      status: "FAILED",
      exitPrice,
      priceChangePct: ((exitPrice - entryPrice) / entryPrice) * 100,
      ...pnl,
      reason: "Liquidation threshold reached.",
    };
  }

  return {
    status: "OPEN",
    exitPrice: null,
    priceChangePct: null,
    grossPnlToman: null,
    totalFeesToman: null,
    netPnlToman: null,
    netPnlPct: null,
  };
}

export type PersistedOpportunityStatus =
  | "OPEN"
  | "SUCCESS"
  | "FAILED"
  | "INVALIDATED"
  | "CLOSED";

export type OpportunityStats = {
  total: number;
  open: number;
  successful: number;
  failed: number;
  invalidated: number;
  closed: number;
  resolved: number;
  successRate: number | null;
};

export function calculateOpportunityStats(
  statuses: PersistedOpportunityStatus[],
): OpportunityStats {
  const total = statuses.length;
  const open = statuses.filter((status) => status === "OPEN").length;
  const successful = statuses.filter((status) => status === "SUCCESS").length;
  const failed = statuses.filter((status) => status === "FAILED").length;
  const invalidated = statuses.filter(
    (status) => status === "INVALIDATED",
  ).length;
  const closed = statuses.filter((status) => status === "CLOSED").length;
  const resolved = successful + failed;

  return {
    total,
    open,
    successful,
    failed,
    invalidated,
    closed,
    resolved,
    successRate: resolved > 0 ? successful / resolved : null,
  };
}
