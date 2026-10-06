import { NextResponse } from "next/server";
import { manuallyCloseTestPosition } from "@/lib/test-position/service";
import type { TestPositionDocument } from "@/lib/test-position/types";

export const dynamic = "force-dynamic";

function serialize(position: TestPositionDocument | null) {
  if (!position) return null;
  return {
    ...position,
    _id: position._id?.toHexString(),
    opportunityId: position.opportunityId.toHexString(),
  };
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const outcome = await manuallyCloseTestPosition(id);

    if (!outcome.closed && outcome.position?.status !== "OPEN") {
      return NextResponse.json(
        { error: "Test position is already closed", position: serialize(outcome.position) },
        { status: 409 },
      );
    }

    if (!outcome.position) {
      return NextResponse.json({ error: "Test position not found" }, { status: 404 });
    }

    return NextResponse.json({
      closed: outcome.closed,
      position: serialize(outcome.position),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to close test position" },
      { status: 400 },
    );
  }
}
