import { NextResponse } from "next/server";
import {
  findOpenOpportunity,
  getOpportunityStats,
  listRecentOpportunities,
} from "@/lib/opportunities/repository";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [open, recent, stats] = await Promise.all([
      findOpenOpportunity(),
      listRecentOpportunities(20),
      getOpportunityStats(),
    ]);

    return NextResponse.json(
      { open, recent, stats },
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
