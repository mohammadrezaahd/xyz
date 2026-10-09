import { NextResponse } from "next/server";
import type { ObjectId } from "mongodb";
import { analyzeOpportunity } from "@/lib/opportunity/engine";
import { isCronAuthorized } from "@/lib/opportunity/cron-auth";
import { evaluateSyntheticOutcome } from "@/lib/opportunity/outcome";
import { buildOpportunityDocument } from "@/lib/opportunity/snapshot";
import { createPositionSimulation } from "@/lib/opportunity/position";
import { listOpenOpportunities, insertOpenOpportunity, invalidateOpportunity, updateOpenMonitoring, resolveOpportunity } from "@/lib/opportunities/repository";
import type { Candle } from "@/lib/candles";
import type { CurrentPricesResponse } from "@/lib/prices";
import { buildResearchObservation } from "@/lib/research/snapshot";
import { createResearchObservation, linkSourceOpportunity } from "@/lib/research/repository";
import { beginAutomationRun, finishAutomationRun } from "@/lib/automation-runs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
type CandleResponse = { bitpin: Candle[]; wallex: Candle[]; errors: string[]; fetchedAt: number };
async function fetchInternal<T>(request: Request, path: string): Promise<T> {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  const response = await fetch(new URL(path, host ? `https://${host}` : new URL(request.url).origin), { cache: "no-store" });
  const body = await response.text();
  let payload: (T & { errors?: string[] }) | null = null;
  try { payload = JSON.parse(body) as T & { errors?: string[] }; } catch { throw new Error(`${path} returned non-JSON HTTP ${response.status}`); }
  if (!response.ok) throw new Error(payload?.errors?.join("; ") ?? `${path} HTTP ${response.status}`);
  return payload;
}
export async function GET(request: Request) {
  if (!isCronAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const runId = await beginAutomationRun("OPPORTUNITY_CRON");
  let runStatus: "SUCCESS" | "FAILED" = "SUCCESS";
  let generatedCount = 0;
  let monitoredCount = 0;
  let stage = "fetch-market-data";
  try {
    const [candles, prices] = await Promise.all([fetchInternal<CandleResponse>(request, "/api/candles"), fetchInternal<CurrentPricesResponse>(request, "/api/prices")]);
    const nowMs = prices.fetchedAt;
    const detectedAt = new Date(nowMs);
    const analysis = analyzeOpportunity({
      bitpinCandles: candles.bitpin ?? [],
      wallexCandles: candles.wallex ?? [],
      currentPrices: { bitpin: prices.bitpinQuote ?? { price: prices.bitpin, fetchedAt: prices.fetchedAt }, wallex: prices.wallexQuote ?? { price: prices.wallex, fetchedAt: prices.fetchedAt } },
      externalReference: prices.externalReference,
      nowMs,
    });
    let researchError: string | null = null;
    async function collectResearch(sourceOpportunityId: ObjectId | null) {
      try {
        const result = await createResearchObservation(buildResearchObservation({ analysis, detectedAt, fetchedAt: detectedAt, source: "LIVE_CRON", sourceOpportunityId }));
        if (sourceOpportunityId && result.observation._id && !result.observation.sourceOpportunityId) await linkSourceOpportunity(result.observation._id, sourceOpportunityId, detectedAt);
        return { id: result.observation._id?.toHexString() ?? null, created: result.created };
      } catch (error) {
        researchError = error instanceof Error ? error.message : "Unable to collect research observation";
        console.error("[cron/opportunities] research collection failed", researchError);
        return null;
      }
    }
    stage = "monitor-open-opportunities";
    const open = await listOpenOpportunities(100);
    monitoredCount = open.length;
    const monitoring = await Promise.allSettled(open.filter((item) => item._id).map(async (item) => {
      const id = item._id!;
      const research = await collectResearch(id);
      await updateOpenMonitoring(id, prices.bitpin, detectedAt);
      const simulation = item.simulation ?? createPositionSimulation(item.entry.price, item.target.price);
      const evaluation = evaluateSyntheticOutcome(item.entry.price, item.target.price, prices.bitpin, item.direction, simulation);
      if (evaluation.status === "SUCCESS" && evaluation.exitPrice !== null && evaluation.priceChangePct !== null) {
        await resolveOpportunity(id, evaluation.exitPrice, evaluation.priceChangePct, detectedAt, "SUCCESS", { grossPnlToman: evaluation.grossPnlToman!, totalFeesToman: evaluation.totalFeesToman!, netPnlToman: evaluation.netPnlToman!, netPnlPct: evaluation.netPnlPct! });
        return { id: id.toHexString(), action: "RESOLVED_SUCCESS", research };
      }
      if (evaluation.status === "FAILED" && evaluation.exitPrice !== null && evaluation.priceChangePct !== null) {
        await resolveOpportunity(id, evaluation.exitPrice, evaluation.priceChangePct, detectedAt, "FAILED", { grossPnlToman: evaluation.grossPnlToman!, totalFeesToman: evaluation.totalFeesToman!, netPnlToman: evaluation.netPnlToman!, netPnlPct: evaluation.netPnlPct! });
        return { id: id.toHexString(), action: "RESOLVED_FAILED", research };
      }
      if (evaluation.status === "INVALIDATED") { await invalidateOpportunity(id, detectedAt); return { id: id.toHexString(), action: "INVALIDATED", research }; }
      return { id: id.toHexString(), action: "MONITORED_OPEN", research };
    }));
    const monitoringErrors = monitoring.filter((item): item is PromiseRejectedResult => item.status === "rejected").map((item) => String(item.reason));
    stage = "evaluate-new-candidate";
    let createdOpportunityId: string | null = null;
    let newResearch = null;
    if (analysis.eligibleForSignal && analysis.prices.bitpin !== null && analysis.prices.wallex !== null && analysis.spread.percent !== null && analysis.target.safeTarget !== null) {
      const document = buildOpportunityDocument(analysis, detectedAt);
      const created = await insertOpenOpportunity(document);
      generatedCount = 1;
      createdOpportunityId = created._id?.toHexString() ?? null;
      newResearch = await collectResearch(created._id ?? null);
    } else {
      newResearch = await collectResearch(null);
    }
    return NextResponse.json({ ok: true, action: createdOpportunityId ? "OPEN_RECORDED" : open.length ? "MONITORED_OPEN_OPPORTUNITIES" : "NO_OPPORTUNITY", opportunityId: createdOpportunityId, openCount: open.length, monitoring: monitoring.map((item) => item.status === "fulfilled" ? item.value : { action: "MONITOR_FAILED", error: String(item.reason) }), monitoringErrors, opportunity: analysis.opportunity, decision: analysis.decision, decisionReason: analysis.decisionReason, score: analysis.stabilityScore, errors: [...(candles.errors ?? []), ...(prices.errors ?? [])], research: newResearch, researchError });
  } catch (error) {
    runStatus = "FAILED";
    console.error("[cron/opportunities] failed", { stage, error });
    return NextResponse.json({ ok: false, stage, error: error instanceof Error ? error.message : "Cron evaluation failed" }, { status: 500 });
  } finally {
    await finishAutomationRun(runId, { status: runStatus, generatedCount, monitoredCount });
  }
}
