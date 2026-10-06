import type { ObjectId } from "mongodb";
import type { OpportunityAnalysis, RiskLevel } from "./types";
import type { PositionDirection } from "./outcome";

export const PHASE_3_ENGINE_VERSION = "phase-2-opportunity-engine";

export type OpportunityDocument = {
  _id?: ObjectId;
  createdAt: Date;
  updatedAt: Date;
  status: "OPEN" | "SUCCESS" | "FAILED" | "INVALIDATED";
  direction: PositionDirection;
  opportunityStrength: OpportunityAnalysis["opportunity"];
  riskLevel?: RiskLevel;
  entry: {
    price: number;
    source: "bitpin";
  };
  target: {
    price: number;
    source: "phase-2-safe-target";
  };
  market: {
    bitpinPrice: number;
    wallexPrice: number;
    spreadPct: number;
  };
  analysis: {
    score: number;
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
    };
  };
  outcome: {
    status: "PENDING" | "SUCCESS" | "FAILED" | "INVALIDATED";
    resolvedAt: Date | null;
    exitPrice: number | null;
    priceChangePct: number | null;
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
    analysis.target.safeTarget === null
  ) {
    throw new Error("Cannot persist an opportunity without valid ticker/spread/target data.");
  }

  return {
    createdAt: detectedAt,
    updatedAt: detectedAt,
    status: "OPEN",
    direction: "SHORT",
    opportunityStrength: analysis.opportunity,
    riskLevel: analysis.riskLevel,
    entry: {
      price: analysis.prices.bitpin,
      source: "bitpin",
    },
    target: {
      price: analysis.target.safeTarget,
      source: "phase-2-safe-target",
    },
    market: {
      bitpinPrice: analysis.prices.bitpin,
      wallexPrice: analysis.prices.wallex,
      spreadPct: analysis.spread.percent,
    },
    analysis: {
      score: analysis.stabilityScore,
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
      },
    },
    outcome: {
      status: "PENDING",
      resolvedAt: null,
      exitPrice: null,
      priceChangePct: null,
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
