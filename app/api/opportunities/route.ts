import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import {
  findOpenOpportunity,
  listOpenOpportunities,
  getOpportunityStats,
  listRecentOpportunities,
} from "@/lib/opportunities/repository";
import type { OpportunityDocument } from "@/lib/opportunity/snapshot";

export const dynamic = "force-dynamic";

function serializeOpportunity(opportunity: OpportunityDocument) {
  const { monitoring, ...rest } = opportunity;

  return {
    ...rest,
    monitoring: {
      currentBitpinPrice: monitoring.currentBitpinPrice ?? null,
      updatedAt: monitoring.updatedAt,
    },
  };
}

export async function GET() {
  try {
    const [open, openList, recent, stats] = await Promise.all([
      findOpenOpportunity(),
      listOpenOpportunities(100),
      listRecentOpportunities(20),
      getOpportunityStats(),
    ]);

    return NextResponse.json(
      {
        open: open ? serializeOpportunity(open) : null,
        openList: openList.map(serializeOpportunity),
        recent: recent.map(serializeOpportunity),
        stats,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to read persisted opportunities",
      },
      { status: 503 },
    );
  }
}
