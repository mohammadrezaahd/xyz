import { NextResponse } from "next/server";
import type { ObjectId } from "mongodb";
import { analyzeOpportunity } from "@/lib/opportunity/engine";
import { isCronAuthorized } from "@/lib/opportunity/cron-auth";
import { evaluateSyntheticOutcome } from "@/lib/opportunity/outcome";
import { buildOpportunityDocument } from "@/lib/opportunity/snapshot";
import { createPositionSimulation } from "@/lib/opportunity/position";
import {
  findOpenOpportunity,
  insertOpenOpportunity,
  invalidateOpportunity,
  updateOpenMonitoring,
  resolveOpportunity,
} from "@/lib/opportunities/repository";
import type { Candle } from "@/lib/candles";
import type { CurrentPricesResponse } from "@/lib/prices";
import { buildResearchObservation } from "@/lib/research/snapshot";
import { createResearchObservation, linkSourceOpportunity } from "@/lib/research/repository";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type CandleResponse = {
  bitpin: Candle[];
  wallex: Candle[];
  errors: string[];
  fetchedAt: number;
};

async function fetchInternal<T>(request: Request, path: string): Promise<T> {
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  const origin = productionHost
    ? `https://${productionHost}`
    : new URL(request.url).origin;
  const url = new URL(path, origin);
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.text();

  let payload: (T & { errors?: string[] }) | null = null;

  try {
    payload = JSON.parse(body) as T & { errors?: string[] };
  } catch {
    throw new Error(
      `Internal market-data ${path} returned HTTP ${response.status} with non-JSON body: ${body.slice(0, 500)}`,
    );
  }

  if (!response.ok) {
    throw new Error(
      payload?.errors?.join("; ") ??
        `Internal market-data ${path} HTTP ${response.status}`,
    );
  }

  return payload;
}

export async function GET(request: Request) {
  let stage = "auth";

  if (!isCronAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    stage = "fetch-market-data";
    const [candles, prices] = await Promise.all([
      fetchInternal<CandleResponse>(request, "/api/candles"),
      fetchInternal<CurrentPricesResponse>(request, "/api/prices"),
    ]);

    stage = "analyze-opportunity";
    const errors = [
      ...(candles.errors ?? []),
      ...(prices.errors ?? []),
    ];

    const analysis = analyzeOpportunity({
      bitpinCandles: candles.bitpin ?? [],
      wallexCandles: candles.wallex ?? [],
      currentPrices: {
        bitpin: prices.providers
          ? { price: prices.bitpin, fetchedAt: prices.providers.bitpin.fetchedAt }
          : { price: prices.bitpin, fetchedAt: prices.fetchedAt },
        wallex: prices.providers
          ? { price: prices.wallex, fetchedAt: prices.providers.wallex.fetchedAt }
          : { price: prices.wallex, fetchedAt: prices.fetchedAt },
      },
      externalPrice: prices.wallex,
      nowMs: prices.fetchedAt,
    });

    const detectedAt = new Date(prices.fetchedAt);
    const validOpportunity =
      analysis.opportunity !== "NONE" &&
      analysis.prices.wallex !== null &&
      analysis.prices.bitpin !== null &&
      analysis.spread.percent !== null &&
      analysis.target.safeTarget !== null;
    let researchError: string | null = null;
    async function collectResearch(sourceOpportunityId: ObjectId | null) {
      try {
        const result = await createResearchObservation(
          buildResearchObservation({
            analysis,
            detectedAt,
            fetchedAt: detectedAt,
            source: "LIVE_CRON",
            sourceOpportunityId,
          }),
        );
        if (sourceOpportunityId && result.observation._id && !result.observation.sourceOpportunityId) {
          await linkSourceOpportunity(result.observation._id, sourceOpportunityId, detectedAt);
        }
        return { id: result.observation._id?.toHexString() ?? null, created: result.created };
      } catch (error) {
        researchError = error instanceof Error ? error.message : "Unable to collect research observation";
        console.error("[cron/opportunities] research collection failed", researchError);
        return null;
      }
    }

    stage = "find-open-opportunity";
    const open = await findOpenOpportunity();

    if (open?._id) {
      const research = await collectResearch(open._id);
      stage = "monitor-open-opportunity";
      await updateOpenMonitoring(
        open._id,
        prices.bitpin,
        new Date(prices.fetchedAt),
      );

      const simulation =
        open.simulation ??
        createPositionSimulation(open.entry.price, open.target.price);

      const evaluation = evaluateSyntheticOutcome(
        open.entry.price,
        open.target.price,
        prices.bitpin,
        open.direction,
        simulation,
      );

      if (
        evaluation.status === "SUCCESS" &&
        evaluation.exitPrice !== null &&
        evaluation.priceChangePct !== null
      ) {
        await resolveOpportunity(
          open._id,
          evaluation.exitPrice,
          evaluation.priceChangePct,
          new Date(prices.fetchedAt),
          "SUCCESS",
          {
            grossPnlToman: evaluation.grossPnlToman!,
            totalFeesToman: evaluation.totalFeesToman!,
            netPnlToman: evaluation.netPnlToman!,
            netPnlPct: evaluation.netPnlPct!,
          },
        );

        return NextResponse.json({
          ok: true,
          action: "RESOLVED_SUCCESS",
          opportunityId: open._id.toHexString(),
          currentBitpinPrice: prices.bitpin,
          errors,
          research,
          researchError,
        });
      }

      if (
        evaluation.status === "FAILED" &&
        evaluation.exitPrice !== null &&
        evaluation.priceChangePct !== null
      ) {
        await resolveOpportunity(
          open._id,
          evaluation.exitPrice,
          evaluation.priceChangePct,
          new Date(prices.fetchedAt),
          "FAILED",
          {
            grossPnlToman: evaluation.grossPnlToman!,
            totalFeesToman: evaluation.totalFeesToman!,
            netPnlToman: evaluation.netPnlToman!,
            netPnlPct: evaluation.netPnlPct!,
          },
        );

        return NextResponse.json({
          ok: true,
          action: "RESOLVED_FAILED",
          opportunityId: open._id.toHexString(),
          currentBitpinPrice: prices.bitpin,
          errors,
          research,
          researchError,
        });
      }

      if (evaluation.status === "INVALIDATED") {
        await invalidateOpportunity(open._id, new Date(prices.fetchedAt));

        return NextResponse.json({
          ok: true,
          action: "INVALIDATED",
          opportunityId: open._id.toHexString(),
          currentBitpinPrice: prices.bitpin,
          errors,
          research,
          researchError,
        });
      }

      return NextResponse.json({
        ok: true,
        action: "MONITORED_OPEN",
        opportunityId: open._id.toHexString(),
        currentBitpinPrice: prices.bitpin,
        errors,
        research,
        researchError,
      });
    }

    if (!validOpportunity) {
      stage = "collect-no-trade-research";
      const research = await collectResearch(null);
      stage = "return-no-opportunity";
      return NextResponse.json({
        ok: true,
        action: "NO_OPPORTUNITY",
        decision: "NO_TRADE",
        opportunity: analysis.opportunity,
        score: analysis.stabilityScore,
        errors,
        research,
        researchError,
      });
    }

    stage = "build-opportunity-document";
    const document = buildOpportunityDocument(
      analysis,
      new Date(prices.fetchedAt),
    );
    stage = "insert-open-opportunity";
    const created = await insertOpenOpportunity(document);
    const research = await collectResearch(created._id ?? null);

    return NextResponse.json({
      ok: true,
      action: "OPEN_RECORDED",
      opportunityId: created._id?.toHexString(),
      opportunity: analysis.opportunity,
      score: analysis.stabilityScore,
      errors,
      research,
      researchError,
    });
  } catch (error) {
    console.error("[cron/opportunities] failed", {
      stage,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json(
      {
        ok: false,
        stage,
        error: error instanceof Error ? error.message : "Cron evaluation failed",
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 },
    );
  }
}
