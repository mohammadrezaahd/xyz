import { NextResponse } from "next/server";
import { listSignals } from "@/lib/signals/service";
import { serializeSignal } from "@/lib/signals/serialization";
export const dynamic = "force-dynamic";
function failure(errorCode: string, message: string, status = 503) { return NextResponse.json({ ok: false, errorCode, message, retryable: status >= 500 }, { status }); }
export async function GET(request: Request) {
  try {
    const p = new URL(request.url).searchParams;
    const limit = Number(p.get("limit") ?? 50);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) return failure("INVALID_FILTER", "Signals limit must be from 1 to 100.", 400);
    const parse = (value: string | null) => value ? new Date(value) : undefined;
    const from = parse(p.get("from")); const to = parse(p.get("to"));
    if ((from && !Number.isFinite(from.getTime())) || (to && !Number.isFinite(to.getTime())) || (from && to && from > to)) return failure("INVALID_FILTER", "Signals date filters must be valid and ordered.", 400);
    const status = p.get("status")?.toUpperCase() || undefined;
    const allowed = new Set(["ACTIVE", "EXPIRED", "RESOLVED", "INVALIDATED"]);
    if (status && !allowed.has(status)) return failure("INVALID_FILTER", "Invalid Signals status filter.", 400);
    const signals = await listSignals({ status: status as never, riskLevel: p.get("riskLevel")?.toUpperCase() || undefined, direction: p.get("direction")?.toUpperCase() || undefined, from, to, limit });
    return NextResponse.json({ ok: true, signals: serializeSignal(signals), total: signals.length, filters: { status: status ?? "ALL", riskLevel: p.get("riskLevel") ?? "ALL", direction: p.get("direction") ?? "ALL", from: from?.toISOString() ?? null, to: to?.toISOString() ?? null, limit } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { console.error("[api/signals] query failed", error); return failure("DATABASE_UNAVAILABLE", "Signals could not be loaded because the research database is unavailable."); }
}
