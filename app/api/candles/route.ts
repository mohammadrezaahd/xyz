import { NextResponse } from "next/server";
import { loadCandleHistory } from "@/lib/candle-history";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const asset = new URL(request.url).searchParams.get("asset");
  return NextResponse.json(await loadCandleHistory(asset), {
    headers: { "Cache-Control": "no-store" },
  });
}
