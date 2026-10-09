import { NextResponse } from "next/server";
import { listSignals } from "@/lib/signals/service";
export const dynamic = "force-dynamic";
export async function GET() { try { const signals = await listSignals({ limit: 100 }); return NextResponse.json({ total: signals.length, active: signals.filter((s) => s.status === "ACTIVE").length, resolved: signals.filter((s) => s.status === "RESOLVED").length, expired: signals.filter((s) => s.status === "EXPIRED").length, invalidated: signals.filter((s) => s.status === "INVALIDATED").length }, { headers: { "Cache-Control": "no-store" } }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to read signal summary" }, { status: 503 }); } }
