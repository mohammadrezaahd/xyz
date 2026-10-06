import { ObjectId } from "mongodb";
import { fetchBitpinPrice } from "../bitpin";
import { findOpportunityById } from "../opportunities/repository";
import {
  calculateExitFee,
  calculateGrossPnl,
  classifyClosedResult,
  createPositionTerms,
  isLiquidationConditionMet,
  markPosition,
} from "./calculations";
import {
  getOrCreateTestAccount,
  refundTestMargin,
  releaseTestMargin,
  reserveTestMargin,
  setTestAccountEquity,
} from "./account";
import {
  closeOpenTestPosition,
  findTestPositionById,
  insertTestPosition,
  listOpenTestPositions,
  updateOpenMonitoring,
  recordOpenMonitoringFailure,
} from "./repository";
import type { OpportunityDocument } from "../opportunity/snapshot";
import { TEST_POSITION_INITIAL_CAPITAL, type TestPositionDocument } from "./types";

function asObjectId(value: string): ObjectId {
  if (!ObjectId.isValid(value)) throw new Error("Invalid id");
  return new ObjectId(value);
}

function buildPredictionSnapshot(
  opportunity: OpportunityDocument,
): TestPositionDocument["predictionSnapshot"] {
  return {
    opportunityId: opportunity._id as ObjectId,
    opportunityStrength: opportunity.opportunityStrength,
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

async function syncAccountEquity(now = new Date()): Promise<void> {
  const account = await getOrCreateTestAccount(now);
  const openPositions = await listOpenTestPositions();
  const equity =
    account.availableCapital +
    openPositions.reduce(
      (sum, position) => sum + position.currentEquity,
      0,
    );

  await setTestAccountEquity(equity, now);
}

export function buildTestPositionDocument(
  opportunity: OpportunityDocument,
  entryPrice: number,
  initialCapital?: number,
  leverage?: number,
  now = new Date(),
): TestPositionDocument {
  if (!opportunity._id) throw new Error("Opportunity id is required");
  if (opportunity.direction !== "SHORT") {
    throw new Error("Phase 4 currently supports SHORT opportunities only");
  }
  if (!Number.isFinite(opportunity.target.price) || opportunity.target.price <= 0) {
    throw new Error("Opportunity target is invalid");
  }

  const terms = createPositionTerms(entryPrice, initialCapital, leverage);

  return {
    opportunityId: opportunity._id,
    status: "OPEN",
    result: null,
    direction: "SHORT",

    initialCapital: terms.initialCapital,
    margin: terms.margin,
    leverage: terms.leverage,
    leveragedCredit: terms.leveragedCredit,
    positionNotional: terms.positionNotional,

    entryPrice,
    targetPrice: opportunity.target.price,
    liquidationPrice: terms.liquidationPrice,

    entryFeePct: terms.entryFeePct,
    exitFeePct: terms.exitFeePct,
    entryFee: terms.entryFee,
    exitFee: null,
    totalFees: terms.entryFee,

    grossPnl: 0,
    netPnl: -terms.entryFee,

    currentPrice: entryPrice,
    currentEquity:
      terms.initialCapital -
      terms.entryFee -
      calculateExitFee(
        entryPrice,
        entryPrice,
        terms.positionNotional,
        terms.exitFeePct,
      ),
    exitPrice: null,
    exitReason: null,

    entryAt: now,
    closedAt: null,

    opportunityStrength: opportunity.opportunityStrength,
    predictionSnapshot: buildPredictionSnapshot(opportunity),

    monitoring: {
      lastCheckedAt: now,
      lastError: null,
    },

    createdAt: now,
    updatedAt: now,
  };
}

export async function startTestPosition(
  opportunityIdValue: string,
  initialCapital?: number,
  leverage?: number,
): Promise<TestPositionDocument> {
  const opportunityId = asObjectId(opportunityIdValue);
  const opportunity = await findOpportunityById(opportunityId);
  if (!opportunity) throw new Error("Opportunity not found");

  const account = await getOrCreateTestAccount();
  const capital = initialCapital ?? TEST_POSITION_INITIAL_CAPITAL;
  if (!Number.isFinite(capital) || capital <= 0) {
    throw new Error("Invalid initialCapital");
  }
  if (capital > account.availableCapital) {
    throw new Error("Insufficient simulated available capital");
  }

  const entryPrice = await fetchBitpinPrice();
  const document = buildTestPositionDocument(
    opportunity,
    entryPrice,
    capital,
    leverage,
  );

  const reserved = await reserveTestMargin(document.margin, document.entryAt);
  if (!reserved) {
    throw new Error("Insufficient simulated available capital");
  }

  try {
    const inserted = await insertTestPosition(document);
    await syncAccountEquity(inserted.createdAt);
    return inserted;
  } catch (error) {
    await refundTestMargin(document.margin);
    throw error;
  }
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
  const mark = markPosition(position, exitPrice);

  const result = classifyClosedResult(
    position.entryPrice,
    position.targetPrice,
    exitPrice,
    "MANUAL_CLOSE",
  );

  const closed = await closeOpenTestPosition(
    id,
    exitPrice,
    "CLOSED",
    result,
    "MANUAL_CLOSE",
    {
      grossPnl: mark.grossPnl,
      exitFee: mark.estimatedExitFee,
      totalFees: mark.totalFees,
      netPnl: mark.netPnl,
      finalEquity: mark.currentEquity,
    },
    new Date(),
  );

  if (closed) {
    await releaseTestMargin(mark.currentEquity);
    await syncAccountEquity();
  }

  return {
    closed,
    position: await findTestPositionById(id),
  };
}

export async function monitorOpenTestPositions(
  currentPrice: number,
  checkedAt = new Date(),
): Promise<{ checked: number; closed: number; liquidated: number }> {
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
    throw new Error("Invalid Bitpin current price");
  }

  const positions = await listOpenTestPositions();
  let closed = 0;
  let liquidated = 0;

  for (const position of positions) {
    if (!position._id) continue;

    const mark = markPosition(position, currentPrice);

    if (isLiquidationConditionMet(mark.currentEquity, position.initialCapital)) {
      const didClose = await closeOpenTestPosition(
        position._id,
        currentPrice,
        "LIQUIDATED",
        "LIQUIDATED",
        "LIQUIDATION",
        {
          grossPnl: mark.grossPnl,
          exitFee: mark.estimatedExitFee,
          totalFees: mark.totalFees,
          netPnl: mark.netPnl,
          finalEquity: mark.currentEquity,
        },
        checkedAt,
      );

      if (didClose) {
        await releaseTestMargin(mark.currentEquity, checkedAt);
        liquidated += 1;
      }
      continue;
    }

    if (currentPrice <= position.targetPrice) {
      const didClose = await closeOpenTestPosition(
        position._id,
        currentPrice,
        "CLOSED",
        "PREDICT_SUCCESS",
        "TARGET_REACHED",
        {
          grossPnl: mark.grossPnl,
          exitFee: mark.estimatedExitFee,
          totalFees: mark.totalFees,
          netPnl: mark.netPnl,
          finalEquity: mark.currentEquity,
        },
        checkedAt,
      );

      if (didClose) {
        await releaseTestMargin(mark.currentEquity, checkedAt);
        closed += 1;
      }
      continue;
    }

    await updateOpenMonitoring(
      position._id,
      {
        currentPrice,
        grossPnl: mark.grossPnl,
        totalFees: mark.totalFees,
        netPnl: mark.netPnl,
        currentEquity: mark.currentEquity,
      },
      checkedAt,
    );
  }

  await syncAccountEquity(checkedAt);

  return { checked: positions.length, closed, liquidated };
}

export async function recordMonitoringFailure(
  checkedAt = new Date(),
  errorMessage = "Bitpin ticker unavailable",
): Promise<number> {
  const positions = await listOpenTestPositions();
  await Promise.all(
    positions.map(async (position) => {
      if (!position._id) return;
      await recordOpenMonitoringFailure(
        position._id,
        checkedAt,
        errorMessage,
      );
    }),
  );

  return positions.length;
}
