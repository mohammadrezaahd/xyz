import type { ExecutionCostConfig } from "./config";

export type ExecutionEconomics = {
  grossEdge: number | null;
  grossEdgePct: number | null;
  feeCostPct: number;
  slippagePct: number;
  latencyPct: number;
  transferCostPct: number;
  totalCostPct: number;
  netEdgePct: number | null;
  expectedNetProfit: number | null;
  breakEvenPrice: number | null;
};

export function calculateExecutionEconomics(
  entryPrice: number | null,
  targetPrice: number | null,
  costs: ExecutionCostConfig,
): ExecutionEconomics {
  const valid = [entryPrice, targetPrice].every(
    (value) => typeof value === "number" && Number.isFinite(value) && value > 0,
  );
  const feeCostPct = costs.takerEntryFeePct + costs.takerExitFeePct;
  const totalCostPct =
    feeCostPct +
    costs.slippageBufferPct +
    costs.latencyBufferPct +
    costs.transferCostPct;
  if (!valid) {
    return {
      grossEdge: null,
      grossEdgePct: null,
      feeCostPct,
      slippagePct: costs.slippageBufferPct,
      latencyPct: costs.latencyBufferPct,
      transferCostPct: costs.transferCostPct,
      totalCostPct,
      netEdgePct: null,
      expectedNetProfit: null,
      breakEvenPrice: null,
    };
  }
  const entry = entryPrice as number;
  const target = targetPrice as number;
  const grossEdge = target - entry;
  const grossEdgePct = (grossEdge / entry) * 100;
  const netEdgePct = grossEdgePct - totalCostPct;
  const expectedNetProfit = entry * (netEdgePct / 100);
  return {
    grossEdge,
    grossEdgePct,
    feeCostPct,
    slippagePct: costs.slippageBufferPct,
    latencyPct: costs.latencyBufferPct,
    transferCostPct: costs.transferCostPct,
    totalCostPct,
    netEdgePct,
    expectedNetProfit,
    breakEvenPrice: entry * (1 + totalCostPct / 100),
  };
}
