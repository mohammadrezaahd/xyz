import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { findOpportunityById } from "@/lib/opportunities/repository";
import { startTestPosition } from "@/lib/test-position/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      opportunityIds?: unknown;
      initialCapital?: unknown;
      leverage?: unknown;
    };
    const ids = Array.isArray(body.opportunityIds)
      ? [...new Set(body.opportunityIds.map(String))]
      : [];

    if (!ids.length) {
      return NextResponse.json({ error: "opportunityIds is required" }, { status: 400 });
    }

    const created: Array<{ opportunityId: string; positionId: string | null }> = [];
    const skipped: Array<{ opportunityId: string; reason: string }> = [];
    const failed: Array<{ opportunityId: string; error: string }> = [];

    for (const opportunityId of ids) {
      try {
        if (!ObjectId.isValid(opportunityId)) {
          failed.push({ opportunityId, error: "Invalid opportunity id" });
          continue;
        }

        const opportunity = await findOpportunityById(new ObjectId(opportunityId));
        if (!opportunity || opportunity.status !== "OPEN") {
          skipped.push({ opportunityId, reason: "Opportunity is missing or not OPEN" });
          continue;
        }

        const position = await startTestPosition({
          opportunityId,
          targetPrice: opportunity.target.price,
          initialCapital:
            body.initialCapital === undefined ? undefined : Number(body.initialCapital),
          leverage: body.leverage === undefined ? undefined : Number(body.leverage),
        });

        created.push({
          opportunityId,
          positionId: position._id?.toHexString() ?? null,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to create paper position";
        if (message.includes("E11000") || message.includes("duplicate")) {
          skipped.push({ opportunityId, reason: "An OPEN paper position already exists for this opportunity" });
        } else {
          failed.push({ opportunityId, error: message });
        }
      }
    }

    return NextResponse.json(
      { created, skipped, failed },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request" },
      { status: 400 },
    );
  }
}
