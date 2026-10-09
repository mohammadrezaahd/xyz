import type { ObjectId } from "mongodb";
import { createHash } from "node:crypto";
import type { OpportunityAnalysis } from "./types";
import type { PositionDirection } from "./outcome";
import type { PositionSimulation } from "./position";
import { createPositionSimulation } from "./position";
import { GATED_ALGORITHM_VERSION } from "./config";

export const PHASE_3_ENGINE_VERSION = GATED_ALGORITHM_VERSION;

export type OpportunityDocument = {
  _id?: ObjectId;
  identityKey?: string;
  createdAt: Date;
  updatedAt: Date;
  status: "OPEN" | "SUCCESS" | "FAILED" | "INVALIDATED" | "CLOSED";
  direction: PositionDirection;
  entry: {
    price: number;
    source: "bitpin";
  };
  target: {
    price: number;
    source: "phase-2-safe-target";
  };
  simulation: PositionSimulation;
  market: {
    bitpinPrice: number;
    wallexPrice: number;
    spreadPct: number;
  };
  analysis: {
    score: number;
    decision: OpportunityAnalysis["decision"];
    decisionReason: string;
    eligibleForSignal: boolean;
    buySellBalance: OpportunityAnalysis["buySellBalance"];
    tests: {
      externalValidation: OpportunityAnalysis["validation"]["external"];
      wallexAboveBitpin: OpportunityAnalysis["validation"]["wallexAboveBitpin"];
      spreadThreshold: OpportunityAnalysis["validation"]["spread"];
      bitpinBullishRatio: OpportunityAnalysis["validation"]["bitpinBullish"];
      wallexBullishRatio: OpportunityAnalysis["validation"]["wallexBullish"];
      candleAlignment: OpportunityAnalysis["validation"]["candleAlignment"];
      targetViability: OpportunityAnalysis["validation"]["targetViability"];
    };
    metrics: {
      bitpinBullishPct: number | null;
      wallexBullishPct: number | null;
      candleAlignmentPct: number | null;
      averageDirectionalMovePct: number | null;
      momentumScore: number | null;
      directionalAgreementPct: number | null;
      directionalParticipationPct: number | null;
      neutralPairPct: number | null;
    };
  };
  outcome: {
    status: "PENDING" | "SUCCESS" | "FAILED" | "INVALIDATED" | "CLOSED";
    resolvedAt: Date | null;
    exitPrice: number | null;
    priceChangePct: number | null;
    grossPnlToman: number | null;
    totalFeesToman: number | null;
    netPnlToman: number | null;
    netPnlPct: number | null;
  };
  detection: {
    detectedAt: Date;
    engineVersion: string;
  };
  monitoring: {
    currentBitpinPrice: number | null;
    updatedAt: Date;
  };
};

export function buildOpportunityDocument(
  analysis: OpportunityAnalysis,
  detectedAt = new Date(),
): OpportunityDocument {
  if (
    analysis.prices.bitpin === null ||
    analysis.prices.wallex === null ||
    analysis.spread.percent === null ||
    analysis.target.safeTarget === null ||
    analysis.eligibleForSignal === false
  ) {
    throw new Error("Cannot persist an opportunity without valid ticker/spread/target data.");
  }

  return {
    identityKey: createHash("sha256").update([
      PHASE_3_ENGINE_VERSION,
      Math.floor(detectedAt.getTime() / 60_000),
      analysis.prices.bitpin,
      analysis.prices.wallex,
      analysis.target.safeTarget,
      analysis.configurationVersion,
    ].join(":")) .digest("hex"),
    createdAt: detectedAt,
    updatedAt: detectedAt,
    status: "OPEN",
    direction: "LONG",
    entry: {
      price: analysis.prices.bitpin,
      source: "bitpin",
    },
    target: {
      price: analysis.target.safeTarget,
      source: "phase-2-safe-target",
    },
    simulation: createPositionSimulation(
      analysis.prices.bitpin,
      analysis.target.safeTarget,
    ),
    market: {
      bitpinPrice: analysis.prices.bitpin,
      wallexPrice: analysis.prices.wallex,
      spreadPct: analysis.spread.percent,
    },
    analysis: {
      score: analysis.stabilityScore,
      decision: analysis.decision ?? "WATCH",
      decisionReason: analysis.decisionReason ?? "Legacy analysis snapshot",
      eligibleForSignal: analysis.eligibleForSignal ?? false,
      buySellBalance: analysis.buySellBalance,
      tests: {
        externalValidation: analysis.validation.external,
        wallexAboveBitpin: analysis.validation.wallexAboveBitpin,
        spreadThreshold: analysis.validation.spread,
        bitpinBullishRatio: analysis.validation.bitpinBullish,
        wallexBullishRatio: analysis.validation.wallexBullish,
        candleAlignment: analysis.validation.candleAlignment,
        targetViability: analysis.validation.targetViability,
      },
      metrics: {
        bitpinBullishPct:
          analysis.candles.bitpinBullishRatio === null
            ? null
            : analysis.candles.bitpinBullishRatio * 100,
        wallexBullishPct:
          analysis.candles.wallexBullishRatio === null
            ? null
            : analysis.candles.wallexBullishRatio * 100,
        candleAlignmentPct:
          analysis.candles.alignmentRatio === null
            ? null
            : analysis.candles.alignmentRatio * 100,
        averageDirectionalMovePct: analysis.candles.averageDirectionalMovePct,
        momentumScore: analysis.candles.momentumScore,
        directionalAgreementPct: analysis.candles.directionalAgreementRatio === null ? null : analysis.candles.directionalAgreementRatio * 100,
        directionalParticipationPct: analysis.candles.directionalParticipationRatio === null ? null : analysis.candles.directionalParticipationRatio * 100,
        neutralPairPct: analysis.candles.neutralPairRatio === null ? null : analysis.candles.neutralPairRatio * 100,
      },
    },
    outcome: {
      status: "PENDING",
      resolvedAt: null,
      exitPrice: null,
      priceChangePct: null,
      grossPnlToman: null,
      totalFeesToman: null,
      netPnlToman: null,
      netPnlPct: null,
    },
    detection: {
      detectedAt,
      engineVersion: PHASE_3_ENGINE_VERSION,
    },
    monitoring: {
      currentBitpinPrice: analysis.prices.bitpin,
      updatedAt: detectedAt,
    },
  };
}
