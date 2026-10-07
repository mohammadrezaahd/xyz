import { NextResponse } from "next/server";
import { createMarketSnapshot, listMarketSnapshots } from "@/lib/market-snapshots/repository";
import type { MarketSnapshotTrend } from "@/lib/market-snapshots/types";

export const dynamic = "force-dynamic";

const trends = new Set<MarketSnapshotTrend>([
  "STRONGLY_BULLISH",
  "BULLISH",
  "STABLE",
  "BEARISH",
  "STRONGLY_BEARISH",
]);

function serialize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialize(item)]));
  }
  return value;
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const limitValue = params.get("limit");
    const limit = limitValue ? Number(limitValue) : 50;
    const trendValue = params.get("trend")?.toUpperCase();
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      return NextResponse.json({ error: "limit must be an integer from 1 to 100" }, { status: 400 });
    }
    if (trendValue && !trends.has(trendValue as MarketSnapshotTrend)) {
      return NextResponse.json({ error: "Invalid snapshot trend" }, { status: 400 });
    }
    const snapshots = await listMarketSnapshots(limit, trendValue as MarketSnapshotTrend | undefined);
    return NextResponse.json(
      { snapshots: serialize(snapshots), total: snapshots.length },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to read snapshots" },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      trend?: MarketSnapshotTrend;
      analysis?: unknown;
    };

    if (!body.trend || !trends.has(body.trend)) {
      return NextResponse.json({ error: "A valid snapshot trend is required" }, { status: 400 });
    }

    if (!body.analysis || typeof body.analysis !== "object") {
      return NextResponse.json({ error: "Snapshot analysis is required" }, { status: 400 });
    }

    const analysis = body.analysis as Parameters<typeof createMarketSnapshot>[0]["analysis"];
    const snapshot = await createMarketSnapshot({
      snapshotVersion: "1",
      createdAt: new Date(),
      market: "USDT_TOMAN",
      trend: body.trend,
      spreadPct: analysis.spread.percent,
      stability: analysis.stabilityScore,
      confidence: analysis.dataCompleteness,
      netEdgePct: analysis.edge.netPct,
      analysis,
    });

    return NextResponse.json({ snapshot: serialize(snapshot) }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create snapshot" },
      { status: 500 },
    );
  }
}
