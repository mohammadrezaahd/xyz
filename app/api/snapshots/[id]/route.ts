import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { findMarketSnapshotById } from "@/lib/market-snapshots/repository";

export const dynamic = "force-dynamic";

function serialize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value instanceof ObjectId) return value.toHexString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialize(item)]));
  }
  return value;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid snapshot id." }, { status: 400 });
    }
    const snapshot = await findMarketSnapshotById(new ObjectId(id));
    if (!snapshot) {
      return NextResponse.json({ error: "Snapshot not found." }, { status: 404 });
    }
    return NextResponse.json({ snapshot: serialize(snapshot) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to read snapshot" },
      { status: 503 },
    );
  }
}
