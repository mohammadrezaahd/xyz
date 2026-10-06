import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { deleteOpportunity } from "@/lib/opportunities/repository";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    if (!ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: "Invalid opportunity id." },
        { status: 400 },
      );
    }

    const result = await deleteOpportunity(new ObjectId(id));

    if (result === "open") {
      return NextResponse.json(
        { error: "OPEN opportunities must be closed before deletion." },
        { status: 409 },
      );
    }

    if (result === "missing") {
      return NextResponse.json(
        { error: "Opportunity not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      action: "DELETED",
      opportunityId: id,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to delete opportunity",
      },
      { status: 500 },
    );
  }
}
