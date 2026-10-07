import { NextResponse } from "next/server";
import { countResearchObservations, listResearchObservations } from "@/lib/research/repository";
import { serializeResearchValue } from "@/lib/research/serialization";
import type { ResearchObservationSource, ResearchObservationStatus } from "@/lib/research/types";

export const dynamic = "force-dynamic";
const statuses = new Set<ResearchObservationStatus>(["DETECTED", "PAPER_STARTED", "RESOLVED", "EXPIRED", "INVALIDATED"]);
const sources = new Set<ResearchObservationSource>(["LIVE_CRON", "BACKTEST"]);

function parseDate(value: string | null, name: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`${name} must be a valid ISO date`);
  return date;
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const statusValue = params.get("status")?.toUpperCase() ?? "ALL";
    const sourceValue = params.get("source")?.toUpperCase() ?? "ALL";
    const limitValue = params.get("limit");
    const limit = limitValue ? Number(limitValue) : 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("limit must be an integer from 1 to 100");
    if (statusValue !== "ALL" && !statuses.has(statusValue as ResearchObservationStatus)) throw new Error("Invalid research observation status");
    if (sourceValue !== "ALL" && !sources.has(sourceValue as ResearchObservationSource)) throw new Error("Invalid research observation source");
    const from = parseDate(params.get("from"), "from");
    const to = parseDate(params.get("to"), "to");
    if (from && to && from > to) throw new Error("from must be before to");
    const filters = {
      status: statusValue === "ALL" ? undefined : statusValue as ResearchObservationStatus,
      source: sourceValue === "ALL" ? undefined : sourceValue as ResearchObservationSource,
      from,
      to,
      limit,
    };
    const [observations, total] = await Promise.all([listResearchObservations(filters), countResearchObservations(filters)]);
    return NextResponse.json({
      observations: serializeResearchValue(observations),
      total,
      limit,
      filters: { status: statusValue, source: sourceValue, from: from?.toISOString() ?? null, to: to?.toISOString() ?? null },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to read research observations";
    return NextResponse.json({ error: message }, { status: message.includes("must be") || message.startsWith("Invalid") ? 400 : 503 });
  }
}
