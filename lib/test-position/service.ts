import { ObjectId } from "mongodb";
import { fetchBitpinPrice } from "../bitpin";
import { findOpportunityById } from "../opportunities/repository";
import type { OpportunityDocument } from "../opportunity/snapshot";
import {
  assertSupportedLeverage,
  classifyClosedResult,
  createPositionTerms,
  isLiquidationConditionMet,
  markPosition,
} from "./calculations";
import {
  closeOpenTestPosition,
  findTestPositionById,
  insertTestPosition,
  listOpenTestPositions,
  recordOpenMonitoringFailure,
  updateOpenMonitoring,
  updateOpenTarget,
} from "./repository";
import type { TestPositionDocument, TestPositionLeverage } from "./types";
import {
  TEST_POSITION_DEFAULT_LEVERAGE,
  TEST_POSITION_INITIAL_CAPITAL,
} from "./types";

function asObjectId(value: string): ObjectId {
  if (!ObjectId.isValid(value)) throw new Error("Invalid id");
  return new ObjectId(value);
}

function riskSnapshot(
  opportunity: OpportunityDocument | null,
  now: Date,
): TestPositionDocument["riskSnapshot"] {
  return {
    source: opportunity ? "OPPORTUNITY" : "MANUAL",
    capturedAt: now,
    opportunityStrength: (opportunity as any)?.opportunityStrength ?? opportunity?.status ?? null,
    score: opportunity?.analysis.score ?? null,
    riskLevel: (opportunity as any)?.riskLevel ?? null,
    direction: "LONG",
  };
}

function buildOpportunitySnapshot(
  opportunity: OpportunityDocument,
): TestPositionDocument["opportunitySnapshot"] {
  if (!opportunity._id) throw new Error("Opportunity id is required");

  return {
    opportunityId: opportunity._id,
    opportunityStrength: (opportunity as any).opportunityStrength ?? opportunity.status,
    direction: opportunity.direction,
    score: opportunity.analysis.score,
    suggestedEntryPrice: opportunity.entry.price,
    suggestedTargetPrice: opportunity.target.price,
    riskLevel: (opportunity as any).riskLevel ?? null,
    market: opportunity.market,
    validation: opportunity.analysis.tests,
    metrics: opportunity.analysis.metrics,
    detection: opportunity.detection,
  };
}

export function buildTestPositionDocument(
  opportunity: OpportunityDocument | null,
  entryPrice: number,
  targetPrice: number,
  initialCapital = TEST_POSITION_INITIAL_CAPITAL,
  leverage: TestPositionLeverage = TEST_POSITION_DEFAULT_LEVERAGE,
  now = new Date(),
): TestPositionDocument {
  if (!Number.isFinite(targetPrice) || targetPrice <= 0) {
    throw new Error("Invalid targetPrice");
  }

  const terms = createPositionTerms(entryPrice, initialCapital, leverage);

  if (targetPrice < entryPrice) {
    throw new Error(
      "LONG targetPrice must be greater than or equal to entryPrice",
    );
  }

  const openingMark = markPosition(
    {
      entryPrice,
      initialCapital: terms.initialCapital,
      positionNotional: terms.positionNotional,
      entryFee: terms.entryFee,
      exitFeePct: terms.exitFeePct,
    },
    entryPrice,
  );

  return {
    opportunityId: opportunity?._id ?? null,
    status: "OPEN",
    result: null,
    direction: "LONG",
    initialCapital: terms.initialCapital,
    margin: terms.margin,
    leverage: terms.leverage,
    leveragedCredit: terms.leveragedCredit,
    borrowedCapital: terms.leveragedCredit,
    positionNotional: terms.positionNotional,
    usdtQuantity: terms.usdtQuantity,
    entryPrice,
    targetPrice,
    liquidationPrice: terms.liquidationPrice,
    breakEvenPrice: terms.breakEvenPrice,
    entryFeePct: terms.entryFeePct,
    exitFeePct: terms.exitFeePct,
    entryFee: terms.entryFee,
    exitFee: null,
    totalFees: openingMark.totalFees,
    grossPnl: openingMark.grossPnl,
    netPnl: openingMark.netPnl,
    roi: openingMark.roi,
    currentPrice: entryPrice,
    currentEquity: openingMark.currentEquity,
    exitPrice: null,
    exitReason: null,
    entryAt: now,
    closedAt: null,
    opportunitySnapshot: opportunity ? buildOpportunitySnapshot(opportunity) : null,
    marketSnapshot: opportunity ? { bitpinPrice: opportunity.market.bitpinPrice, wallexPrice: opportunity.market.wallexPrice, capturedAt: now } : null,
    riskSnapshot: riskSnapshot(opportunity, now),
    monitoring: {
      lastCheckedAt: now,
      lastError: null,
    },
    createdAt: now,
    updatedAt: now,
  };
}

export async function startTestPosition(input: {
  initialCapital?: number;
  leverage?: number;
  targetPrice: number;
  opportunityId?: string | null;
}): Promise<TestPositionDocument> {
  const capital = input.initialCapital ?? TEST_POSITION_INITIAL_CAPITAL;
  const leverage = input.leverage ?? TEST_POSITION_DEFAULT_LEVERAGE;

  if (!Number.isFinite(capital) || capital <= 0) {
    throw new Error("Invalid initialCapital");
  }
  assertSupportedLeverage(leverage);

  let opportunity: OpportunityDocument | null = null;
  if (input.opportunityId) {
    opportunity = await findOpportunityById(asObjectId(input.opportunityId));
    if (!opportunity) throw new Error("Opportunity not found");
  }

  const entryPrice = await fetchBitpinPrice();
  const document = buildTestPositionDocument(
    opportunity,
    entryPrice,
    input.targetPrice,
    capital,
    leverage,
  );

  return insertTestPosition(document);
}

export async function updateTestPositionTarget(
  idValue: string,
  targetPrice: number,
): Promise<TestPositionDocument | null> {
  const id = asObjectId(idValue);

  if (!Number.isFinite(targetPrice) || targetPrice <= 0) {
    throw new Error("Invalid targetPrice");
  }

  const position = await findTestPositionById(id);
  if (!position) throw new Error("Test position not found");
  if (position.status !== "OPEN") {
    throw new Error("Test position is not OPEN");
  }
  if (targetPrice < position.entryPrice) {
    throw new Error(
      "LONG targetPrice must be greater than or equal to entryPrice",
    );
  }

  const updated = await updateOpenTarget(id, targetPrice, new Date());
  if (!updated) throw new Error("Test position is not OPEN");

  return findTestPositionById(id);
}

export async function manuallyCloseTestPosition(
  idValue: string,
): Promise<{
  closed: boolean;
  position: TestPositionDocument | null;
}> {
  const id = asObjectId(idValue);
  const position = await findTestPositionById(id);

  if (!position) throw new Error("Test position not found");
  if (position.status !== "OPEN") return { closed: false, position };

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
      roi: mark.roi,
      finalEquity: mark.currentEquity,
    },
    new Date(),
  );

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

    if (isLiquidationConditionMet(mark.grossPnl, position.initialCapital)) {
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
          roi: mark.roi,
          finalEquity: mark.currentEquity,
        },
        checkedAt,
      );
      if (didClose) liquidated++;
      continue;
    }

    if (currentPrice >= position.targetPrice) {
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
          roi: mark.roi,
          finalEquity: mark.currentEquity,
        },
        checkedAt,
      );
      if (didClose) closed++;
      continue;
    }

    await updateOpenMonitoring(
      position._id,
      {
        currentPrice,
        grossPnl: mark.grossPnl,
        totalFees: mark.totalFees,
        netPnl: mark.netPnl,
        roi: mark.roi,
        currentEquity: mark.currentEquity,
      },
      checkedAt,
    );
  }

  return { checked: positions.length, closed, liquidated };
}

export async function recordMonitoringFailure(
  checkedAt = new Date(),
  errorMessage = "Bitpin ticker unavailable",
): Promise<number> {
  const positions = await listOpenTestPositions();

  await Promise.all(
    positions.map(async (position) => {
      if (position._id) {
        await recordOpenMonitoringFailure(
          position._id,
          checkedAt,
          errorMessage,
        );
      }
    }),
  );

  return positions.length;
}
