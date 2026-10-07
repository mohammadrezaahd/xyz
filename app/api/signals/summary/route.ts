import { NextResponse } from "next/server";
import { getSignalSummary } from "@/lib/signals/repository";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return NextResponse.json(await getSignalSummary(), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load signal summary" }, { status: 503 }); }
}
