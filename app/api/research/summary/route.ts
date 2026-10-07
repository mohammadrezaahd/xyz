import { NextResponse } from "next/server";
import { getResearchSummary } from "@/lib/research/repository";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getResearchSummary(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to read research summary" }, { status: 503 });
  }
}
