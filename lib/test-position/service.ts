import { ObjectId } from "mongodb";
import { fetchBitpinPrice } from "@/lib/bitpin";
import { findOpportunityById } from "@/lib/opportunities/repository";
import {
  calculateNetPnl,
  classifyClosedResult,
  createPositionTerms,
  isLiquidationConditionMet,
} from "./calculations";
import {
  closeOpenTestPosition,
  findTestPositionById,
  insertTestPosition,
  listOpenTestPositions,
  updateOpenMonitoring,
} from "./repository";
import type { TestPositionDocument } from "./types";

function asObjectId(value: string): ObjectId {
  if (!ObjectId.isValid(value)) throw new Error("Invalid id");
  return new ObjectId(value);
}

function serializeValidation(
  opportunity: NonNullable<Awaited<ReturnType<typeof findOpportunityById>>>,
): TestPositionDocument["predictionSnapshot"] {
  return {
    opportunityStrength:
      opportunity.analysis.tests.targetViability.status === "SUCCESS"
        ? "VALIDATED"
        : "UNSPECIFIED",
    direction: opportunity.direction,
    score: opportunity.analysis.score,
    entry: opportunity.entry,
    target: opportunity.target,
    market: opportunity.market,
    validation: opportunity.analysis.tests,
    metrics: opportunity.analysis.metrics,
    detection: opportunity.detection,
  };
}

function getOpportunityStrength(
  opportunity: NonNullable<Awaited<ReturnType<typeof findOpportunityById>>>,
): string {
  const score = opportunity.analysis.score;
  if (score >= 80) return "STRONG";
  if (score >= 60) return "MODERATE";
  if (score >= 40) return "WEAK";
  return "NONE";
}

export async function startTestPosition(
  opportunityIdValue: string,
  initialCapital?: number,
  leverage?: number,
): Promise<TestPositionDocument> {
  const opportunityId = asObjectId(opportunityIdValue);
  const opportunity = await findOpportunityById(opportunityId);

  if (!opportunity) throw new Error("Opportunity not found");
  if (opportunity.direction !== "SHORT") {
    throw new Error("Phase 4 currently supports SHORT opportunities only");
  }
  if (!Number.isFinite(opportunity.target.price) || opportunity.target.price <= 0) {
    throw new Error("Opportunity target is invalid");
  }

  const entryPrice = await fetchBitpinPrice();
  const terms = createPositionTerms(entryPrice, initialCapital, leverage);
  const now = new Date();

  const document: TestPositionDocument = {
    opportunityId,
    status: "OPEN",
    result: null,
    direction: "SHORT",
    entryPrice,
    targetPrice: opportunity.target.price,
    liquidationPrice: terms.liquidationPrice,
    exitPrice: null,
    initialCapital: terms.initialCapital,
    leverage: terms.leverage,
    leveragedCredit: terms.leveragedCredit,
    positionNotional: terms.positionNotional,
    entryFeePct: terms.entryFeePct,
    exitFeePct: terms.exitFeePct,
    entryFee: terms.entryFee,
    exitFee: null,
    totalFees: terms.entryFee,
    grossPnl: 0,
    netPnl: -terms.entryFee,
    opportunityStrength: getOpportunityStrength(opportunity),
    predictionSnapshot: serializeValidation(opportunity),
    entryAt: now,
    closedAt: null,
    exitReason: null,
    monitoring: {
      currentBitpinPrice: entryPrice,
      lastCheckedAt: now,
      lastError: null,
    },
    createdAt: now,
    updatedAt: now,
  };

  return insertTestPosition(document);
}

export async function manuallyCloseTestPosition(
  idValue: string,
): Promise<{ closed: boolean; position: TestPositionDocument | null }> {
  const id = asObjectId(idValue);
  const position = await findTestPositionById(id);

  if (!position) throw new Error("Test position not found");
  if (position.status !== "OPEN") {
    return { closed: false, position };
  }

  const exitPrice = await fetchBitpinPrice();
  const pnl = calculateNetPnl(
    position.entryPrice,
    exitPrice,
    position.positionNotional,
    position.entryFee,
    position.exitFeePct,
  );
  const result = classifyClosedResult(
    position.entryPrice,
    position.targetPrice,
    exitPrice,
    "MANUAL_CLOSE",
  );

  const closed = await closeOpenTestPosition(
    id,
    exitPrice,
    result,
    "MANUAL_CLOSE",
    pnl.grossPnl,
    pnl.exitFee,
    pnl.totalFees,
    pnl.netPnl,
    new Date(),
  );

  return {
    closed,
    position: closed ? await findTestPositionById(id) : await findTestPositionById(id),
  };
}

export async function monitorOpenTestPositions(
  currentPrice: number,
  checkedAt = new Date(),
): Promise<{ checked: number; closed: number; liquidated: number }> {
  const positions = await listOpenTestPositions();
  let closed = 0;
  let liquidated = 0;

  for (const position of positions) {
    const pnl = calculateNetPnl(
      position.entryPrice,
      currentPrice,
      position.positionNotional,
      position.entryFee,
      position.exitFeePct,
    );

    if (
      isLiquidationConditionMet(
        position.entryPrice,
        currentPrice,
        position.positionNotional,
        position.entryFee,
        position.exitFeePct,
      )
    ) {
      const didClose = await closeOpenTestPosition(
        position._id as ObjectId,
        currentPrice,
        "LIQUIDATED",
        "LIQUIDATION",
        pnl.grossPnl,
        pnl.exitFee,
        pnl.totalFees,
        pnl.netPnl,
        checkedAt,
      );
      if (didClose) liquidated += 1;
      continue;
    }

    if (currentPrice <= position.targetPrice) {
      const didClose = await closeOpenTestPosition(
        position._id as ObjectId,
        currentPrice,
        "PREDICT_SUCCESS",
        "TARGET_REACHED",
        pnl.grossPnl,
        pnl.exitFee,
        pnl.totalFees,
        pnl.netPnl,
        checkedAt,
      );
      if (didClose) closed += 1;
      continue;
    }

    await updateOpenMonitoring(position._id as ObjectId, currentPrice, checkedAt, null);
  }

  return {
    checked: positions.length,
    closed,
    liquidated,
  };
}

export async function recordMonitoringFailure(
  checkedAt = new Date(),
  errorMessage = "Bitpin ticker unavailable",
): Promise<number> {
  const positions = await listOpenTestPositions();
  await Promise.all(
    positions.map((position) =>
      updateOpenMonitoring(
        position._id as ObjectId,
        null,
        checkedAt,
        errorMessage,
      ),
    ),
  );
  return positions.length;
}
