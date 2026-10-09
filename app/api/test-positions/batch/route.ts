import { NextResponse } from "next/server";
import { startTestPositionsBatch } from "@/lib/test-position/service";
import { serializeResearchValue } from "@/lib/research/serialization";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const opportunityIds = Array.isArray(body.opportunityIds) ? body.opportunityIds.map(String).filter(Boolean) : [];
    if (!opportunityIds.length) return NextResponse.json({ error: "opportunityIds must contain at least one id" }, { status: 400 });
    const initialCapital = body.initialCapital === undefined ? undefined : Number(body.initialCapital);
    const leverage = body.leverage === undefined ? undefined : Number(body.leverage);
    const result = await startTestPositionsBatch({ opportunityIds, initialCapital, leverage });
    return NextResponse.json(serializeResearchValue(result), { status: 207, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create paper positions" }, { status: 400 }); }
}
