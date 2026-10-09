import { NextResponse } from "next/server";
import { getSignalsSummary } from "@/lib/signals/service";
import { serializeResearchValue } from "@/lib/research/serialization";
export const dynamic = "force-dynamic";
export async function GET() { try { return NextResponse.json(serializeResearchValue(await getSignalsSummary()), { headers: { "Cache-Control": "no-store" } }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to read Signals diagnostics" }, { status: 503 }); } }
