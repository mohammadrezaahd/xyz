import { NextResponse } from "next/server";
import { listSignals } from "@/lib/signals/service";
import { serializeSignal } from "@/lib/signals/serialization";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const p = new URL(request.url).searchParams;
    const limit = Number(p.get("limit") ?? 50);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("limit must be from 1 to 100");
    const parse = (value: string | null) => value ? new Date(value) : undefined;
    const from = parse(p.get("from")); const to = parse(p.get("to"));
    const signals = await listSignals({ status: p.get("status")?.toUpperCase() as never || undefined, riskLevel: p.get("riskLevel")?.toUpperCase() || undefined, direction: p.get("direction")?.toUpperCase() || undefined, from, to, limit });
    return NextResponse.json({ signals: serializeSignal(signals), total: signals.length, filters: { status: p.get("status") ?? "ALL", riskLevel: p.get("riskLevel") ?? "ALL", direction: p.get("direction") ?? "ALL", from: from?.toISOString() ?? null, to: to?.toISOString() ?? null, limit } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to read signals" }, { status: 400 }); }
}
