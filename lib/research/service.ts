import type { ObjectId } from "mongodb";
import type { TestPositionDocument } from "../test-position/types";
import {
  findResearchObservationBySourceOpportunityId,
  linkPaperPosition,
  resolveResearchObservation,
} from "./repository";

export async function linkTestPositionToResearchObservation(
  sourceOpportunityId: ObjectId,
  paperPositionId: ObjectId,
  startedAt: Date,
): Promise<"linked" | "already-linked" | "missing" | "conflict" | "resolved"> {
  const observation = await findResearchObservationBySourceOpportunityId(sourceOpportunityId);
  if (!observation?._id) return "missing";
  return linkPaperPosition(observation._id, paperPositionId, startedAt);
}

export async function synchronizeResolvedTestPosition(
  position: TestPositionDocument,
): Promise<"resolved" | "already-resolved" | "missing" | "skipped"> {
  if (!position._id || position.status === "OPEN" || !position.closedAt || !position.exitPrice) return "skipped";
  const durationMs = Math.max(0, position.closedAt.getTime() - position.entryAt.getTime());
  return resolveResearchObservation(
    position._id,
    {
      entryPrice: position.entryPrice,
      exitPrice: position.exitPrice,
      targetPrice: position.targetPrice,
      liquidationPrice: position.liquidationPrice,
      result: position.result,
      exitReason: position.exitReason,
      grossPnl: position.grossPnl,
      totalFees: position.totalFees,
      netPnl: position.netPnl,
      roi: position.roi,
      durationMs,
      resolvedAt: position.closedAt,
    },
    position.closedAt,
  );
}

export function logResearchSyncFailure(context: string, error: unknown): void {
  console.error(`[research] ${context} synchronization failed`, error instanceof Error ? error.message : String(error));
}
