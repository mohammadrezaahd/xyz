import { NextResponse } from "next/server";
import { getSignalsSummary } from "@/lib/signals/service";
import { serializeResearchValue } from "@/lib/research/serialization";
export const dynamic = "force-dynamic";
export async function GET() {
  try { const summary = serializeResearchValue(await getSignalsSummary()) as Record<string, unknown>; return NextResponse.json({ ok: true, ...summary }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { console.error("[api/signals/summary] query failed", error); return NextResponse.json({ ok: false, errorCode: "DATABASE_UNAVAILABLE", message: "Signals diagnostics could not be loaded because the research database is unavailable.", retryable: true }, { status: 503 }); }
}
