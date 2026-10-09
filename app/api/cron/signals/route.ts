import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/opportunity/cron-auth";
import { generateSignals, monitorSignals } from "@/lib/signals/service";
import { parsePositivePrice } from "@/lib/prices";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
  if (!isCronAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const host = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
    const response = await fetch(new URL("/api/prices", host ? `https://${host}` : new URL(request.url).origin), { cache: "no-store" });
    const prices = await response.json() as { bitpin?: unknown; errors?: string[] };
    const generated = await generateSignals();
    const monitoring = await monitorSignals(parsePositivePrice(prices.bitpin));
    return NextResponse.json({ ok: true, generated: generated.length, monitoring, errors: prices.errors ?? [] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Signals cron failed" }, { status: 503 }); }
}
