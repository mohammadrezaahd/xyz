export type PositionDirection = "LONG" | "SHORT";
export type SyntheticOutcomeStatus = "OPEN" | "SUCCESS" | "FAILED" | "INVALIDATED";

export type SyntheticOutcomeEvaluation = {
  status: SyntheticOutcomeStatus;
  exitPrice: number | null;
  priceChangePct: number | null;
  reason?: string;
};

function isValidStoredPrice(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export function evaluateSyntheticOutcome(
  entryPrice: number,
  targetPrice: number,
  currentPrice: number | null | undefined,
  direction: PositionDirection,
): SyntheticOutcomeEvaluation {
  if (!isValidStoredPrice(entryPrice)) {
    return {
      status: "INVALIDATED",
      exitPrice: null,
      priceChangePct: null,
      reason: "Stored entry price is structurally invalid.",
    };
  }

  if (!isValidStoredPrice(targetPrice)) {
    return {
      status: "INVALIDATED",
      exitPrice: null,
      priceChangePct: null,
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
      reason: "Current Bitpin price is unavailable or invalid.",
    };
  }

  if (direction === "LONG" || direction === "SHORT") {
    if (currentPrice >= targetPrice) {
      return {
        status: "SUCCESS",
        exitPrice: currentPrice,
        priceChangePct: ((currentPrice - entryPrice) / entryPrice) * 100,
      };
    }

    if (currentPrice < entryPrice) {
      return {
        status: "FAILED",
        exitPrice: currentPrice,
        priceChangePct: ((currentPrice - entryPrice) / entryPrice) * 100,
      };
    }

    return {
      status: "OPEN",
      exitPrice: null,
      priceChangePct: null,
    };
  }

  return {
    status: "INVALIDATED",
    exitPrice: null,
    priceChangePct: null,
    reason: "Unsupported position direction.",
  };
}

export type PersistedOpportunityStatus =
  | "OPEN"
  | "SUCCESS"
  | "FAILED"
  | "INVALIDATED";

export type OpportunityStats = {
  total: number;
  open: number;
  successful: number;
  failed: number;
  invalidated: number;
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
  const invalidated = statuses.filter((status) => status === "INVALIDATED").length;
  const resolved = successful + failed;

  return {
    total,
    open,
    successful,
    failed,
    invalidated,
    resolved,
    successRate: resolved > 0 ? successful / resolved : null,
  };
}
