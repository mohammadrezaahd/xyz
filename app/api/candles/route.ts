import { NextResponse } from "next/server";
import { loadCandleHistory } from "@/lib/candle-history";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  return NextResponse.json(await loadCandleHistory(), {
    headers: { "Cache-Control": "no-store" },
  });
}
