import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/opportunity/cron-auth";
import { listResearchObservations } from "@/lib/research/repository";
import { processSignal } from "@/lib/signals/service";
import { fetchBitpinPrice } from "@/lib/bitpin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isCronAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const currentPrice = await fetchBitpinPrice();
    const observations = await listResearchObservations({ source: "LIVE_CRON", limit: 50 });
    let processed = 0;
    for (const observation of observations) {
      if (observation.status === "INVALIDATED" || observation.status === "EXPIRED") continue;
      await processSignal(observation, currentPrice, new Date());
      processed++;
    }
    return NextResponse.json({ ok: true, currentPrice, processed }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Signal cron failed" }, { status: 503 });
  }
}
