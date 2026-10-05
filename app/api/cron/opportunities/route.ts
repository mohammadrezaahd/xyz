import { NextResponse } from "next/server";
import { analyzeOpportunity } from "@/lib/opportunity/engine";
import { isCronAuthorized } from "@/lib/opportunity/cron-auth";
import { evaluateSyntheticOutcome } from "@/lib/opportunity/outcome";
import { buildOpportunityDocument } from "@/lib/opportunity/snapshot";
import {
  findOpenOpportunity,
  insertOpenOpportunity,
  invalidateOpportunity,
  updateOpenMonitoring,
  resolveOpportunity,
} from "@/lib/opportunities/repository";
import type { Candle } from "@/lib/candles";
import type { CurrentPricesResponse } from "@/lib/prices";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type CandleResponse = {
  bitpin: Candle[];
  wallex: Candle[];
  errors: string[];
  fetchedAt: number;
};

async function fetchInternal<T>(request: Request, path: string): Promise<T> {
  const url = new URL(path, request.url);
  const response = await fetch(url, { cache: "no-store" });
  const payload = (await response.json()) as T & { errors?: string[] };

  if (!response.ok) {
    throw new Error(
      payload.errors?.join("; ") ?? `Internal market-data HTTP ${response.status}`,
    );
  }

  return payload;
}

export async function GET(request: Request) {
  if (!isCronAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [candles, prices] = await Promise.all([
      fetchInternal<CandleResponse>(request, "/api/candles"),
      fetchInternal<CurrentPricesResponse>(request, "/api/prices"),
    ]);

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
      externalPrice: null,
      nowMs: prices.fetchedAt,
    });

    const open = await findOpenOpportunity();

    if (open?._id) {
      await updateOpenMonitoring(
        open._id,
        prices.bitpin,
        new Date(prices.fetchedAt),
      );

      const evaluation = evaluateSyntheticOutcome(
        open.entry.price,
        open.target.price,
        prices.bitpin,
        open.direction,
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
        );

        return NextResponse.json({
          ok: true,
          action: "RESOLVED_SUCCESS",
          opportunityId: open._id.toHexString(),
          currentBitpinPrice: prices.bitpin,
          errors,
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
        );

        return NextResponse.json({
          ok: true,
          action: "RESOLVED_FAILED",
          opportunityId: open._id.toHexString(),
          currentBitpinPrice: prices.bitpin,
          errors,
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
        });
      }

      return NextResponse.json({
        ok: true,
        action: "MONITORED_OPEN",
        opportunityId: open._id.toHexString(),
        currentBitpinPrice: prices.bitpin,
        errors,
      });
    }

    const validOpportunity =
      analysis.opportunity !== "NONE" &&
      analysis.prices.wallex !== null &&
      analysis.prices.bitpin !== null &&
      analysis.spread.percent !== null &&
      analysis.target.safeTarget !== null;

    if (!validOpportunity) {
      return NextResponse.json({
        ok: true,
        action: "NO_OPPORTUNITY",
        opportunity: analysis.opportunity,
        score: analysis.stabilityScore,
        errors,
      });
    }

    const document = buildOpportunityDocument(
      analysis,
      new Date(prices.fetchedAt),
    );
    const created = await insertOpenOpportunity(document);

    return NextResponse.json({
      ok: true,
      action: "OPEN_RECORDED",
      opportunityId: created._id?.toHexString(),
      opportunity: analysis.opportunity,
      score: analysis.stabilityScore,
      errors,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Cron evaluation failed",
      },
      { status: 500 },
    );
  }
}
