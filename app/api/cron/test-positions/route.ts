import { NextResponse } from "next/server";
import { fetchBitpinPrice } from "@/lib/bitpin";
import { isCronAuthorized } from "@/lib/opportunity/cron-auth";
import { monitorOpenTestPositions, recordMonitoringFailure } from "@/lib/test-position/service";
export const dynamic = "force-dynamic"; export const maxDuration = 60;
export async function GET(request: Request) { if (!isCronAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const checkedAt = new Date(); try { const currentPrice = await fetchBitpinPrice(); return NextResponse.json({ ok: true, currentBitpinPrice: currentPrice, ...(await monitorOpenTestPositions(currentPrice, checkedAt)) }, { headers: { "Cache-Control": "no-store" } }); } catch (e) { const affected = await recordMonitoringFailure(checkedAt, e instanceof Error ? e.message : "Bitpin ticker unavailable"); return NextResponse.json({ ok: false, action: "PRICE_UNAVAILABLE", openPositions: affected, error: e instanceof Error ? e.message : "Bitpin ticker unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } }); } }
