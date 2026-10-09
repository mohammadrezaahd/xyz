import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/opportunity/cron-auth";
import { generateSignals, monitorSignals } from "@/lib/signals/service";
import { parsePositivePrice } from "@/lib/prices";
import { beginAutomationRun, finishAutomationRun } from "@/lib/automation-runs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
  if (!isCronAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const runId = await beginAutomationRun("SIGNALS_CRON");
  try {
    const host = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
    const response = await fetch(new URL("/api/prices", host ? `https://${host}` : new URL(request.url).origin), { cache: "no-store" });
    const prices = await response.json() as { bitpin?: unknown; errors?: string[] };
    const generated = await generateSignals();
    const monitoring = await monitorSignals(parsePositivePrice(prices.bitpin));
    await finishAutomationRun(runId, { status: "SUCCESS", generatedCount: generated.length, monitoredCount: monitoring.checked });
    return NextResponse.json({ ok: true, generated: generated.length, monitoring, errors: prices.errors ?? [], reason: generated.length === 0 ? "No eligible observations available" : null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Signals cron failed";
    await finishAutomationRun(runId, { status: "FAILED", error: message });
    return NextResponse.json({ ok: false, error: message, generated: 0, monitoring: { checked: 0, resolved: 0 } }, { status: 503 });
  }
}
