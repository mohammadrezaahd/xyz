import { NextResponse } from "next/server";
import type { ObjectId } from "mongodb";
import { analyzeOpportunity } from "@/lib/opportunity/engine";
import { isCronAuthorized } from "@/lib/opportunity/cron-auth";
import { evaluateSyntheticOutcome } from "@/lib/opportunity/outcome";
import { buildOpportunityDocument } from "@/lib/opportunity/snapshot";
import { createPositionSimulation } from "@/lib/opportunity/position";
import {
  findOpenOpportunity,\n  listOpenOpportunities,\n  findOpportunityByObservationKey,
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
        bitpin: prices.bitpin,
        wallex: prices.wallex,
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
      if (!validOpportunity) return null;
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

    stage = "monitor-open-opportunities";
    const openOpportunities = await listOpenOpportunities(100);
    const monitored: Array<{ opportunityId: string; action: string; research?: unknown; error?: string }> = [];

    for (const open of openOpportunities) {
      if (!open._id) continue;
      try {
        const research = await collectResearch(open._id);
        await updateOpenMonitoring(open._id, prices.bitpin, detectedAt);
        const simulation = open.simulation ?? createPositionSimulation(open.entry.price, open.target.price);
        const evaluation = evaluateSyntheticOutcome(
          open.entry.price,
          open.target.price,
          prices.bitpin,
          open.direction,
          simulation,
        );

        if (evaluation.status === "SUCCESS" && evaluation.exitPrice !== null && evaluation.priceChangePct !== null) {
          await resolveOpportunity(open._id, evaluation.exitPrice, evaluation.priceChangePct, detectedAt, "SUCCESS", {
            grossPnlToman: evaluation.grossPnlToman!,
            totalFeesToman: evaluation.totalFeesToman!,
            netPnlToman: evaluation.netPnlToman!,
            netPnlPct: evaluation.netPnlPct!,
          });
          monitored.push({ opportunityId: open._id.toHexString(), action: "RESOLVED_SUCCESS", research });
        } else if (evaluation.status === "FAILED" && evaluation.exitPrice !== null && evaluation.priceChangePct !== null) {
          await resolveOpportunity(open._id, evaluation.exitPrice, evaluation.priceChangePct, detectedAt, "FAILED", {
            grossPnlToman: evaluation.grossPnlToman!,
            totalFeesToman: evaluation.totalFeesToman!,
            netPnlToman: evaluation.netPnlToman!,
            netPnlPct: evaluation.netPnlPct!,
          });
          monitored.push({ opportunityId: open._id.toHexString(), action: "RESOLVED_FAILED", research });
        } else if (evaluation.status === "INVALIDATED") {
          await invalidateOpportunity(open._id, detectedAt);
          monitored.push({ opportunityId: open._id.toHexString(), action: "INVALIDATED", research });
        } else {
          monitored.push({ opportunityId: open._id.toHexString(), action: "MONITORED_OPEN", research });
        }
      } catch (error) {
        monitored.push({
          opportunityId: open._id.toHexString(),
          action: "ERROR",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (!validOpportunity) {
      stage = "return-no-opportunity";
      return NextResponse.json({
        ok: true,
        action: "NO_OPPORTUNITY",
        opportunity: analysis.opportunity,
        score: analysis.stabilityScore,
        errors,
        research: null,
      });
    }

    stage = "build-opportunity-document";
    const document = buildOpportunityDocument(
      analysis,
      new Date(prices.fetchedAt),
    );
    stage = "insert-open-opportunity";
    if (document.observationKey && await findOpportunityByObservationKey(document.observationKey)) {
      return NextResponse.json({
        ok: true,
        action: "DUPLICATE_OPPORTUNITY",
        openProcessed: monitored.length,
        monitored,
        errors,
      });
    }
    const created = await insertOpenOpportunity(document);
    const research = await collectResearch(created._id ?? null);

    return NextResponse.json({
      ok: true,
      action: "OPEN_RECORDED",
      opportunityId: created._id?.toHexString(),
      opportunity: analysis.opportunity,
      score: analysis.stabilityScore,
      openProcessed: monitored.length,
      monitored,
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
