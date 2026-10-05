export type PositionDirection = "SHORT";
export type SyntheticOutcomeStatus = "OPEN" | "SUCCESS" | "INVALIDATED";

export type SyntheticOutcomeEvaluation = {
  status: SyntheticOutcomeStatus;
  exitPrice: number | null;
  priceChangePct: number | null;
  reason?: string;
};

export function evaluateSyntheticOutcome(
  entryPrice: number,
  currentPrice: number | null | undefined,
  direction: PositionDirection,
): SyntheticOutcomeEvaluation {
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
    return {
      status: "INVALIDATED",
      exitPrice: null,
      priceChangePct: null,
      reason: "Stored entry price is structurally invalid.",
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
      reason: "Current Wallex price is unavailable or invalid.",
    };
  }

  if (direction === "SHORT" && currentPrice <= entryPrice) {
    return {
      status: "SUCCESS",
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
  successRate: number;
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
    successRate: resolved > 0 ? (successful / resolved) * 100 : 0,
  };
}
