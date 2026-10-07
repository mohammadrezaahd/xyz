import { NextResponse } from "next/server";
import { listSignals } from "@/lib/signals/repository";
import { serializeSignal } from "@/lib/signals/serialization";
import type { SignalDirection, SignalRisk, SignalStatus } from "@/lib/signals/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const risk = url.searchParams.get("riskLevel") as SignalRisk | null;
  const status = url.searchParams.get("status") as SignalStatus | null;
  const direction = url.searchParams.get("direction") as SignalDirection | null;
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const signals = await listSignals({
    riskLevel: risk && risk !== "ALL" ? risk : undefined,
    status: status || undefined,
    direction: direction || undefined,
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
    limit: Number(url.searchParams.get("limit") || 50),
  });
  return NextResponse.json({ signals: serializeSignal(signals) }, { headers: { "Cache-Control": "no-store" } });
}
