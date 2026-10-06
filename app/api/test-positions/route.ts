import { NextResponse } from "next/server";
import { startTestPosition } from "@/lib/test-position/service";
import { listTestPositions } from "@/lib/test-position/repository";
import type { TestPositionDocument } from "@/lib/test-position/types";

export const dynamic = "force-dynamic";

function serialize(position: TestPositionDocument) {
  return {
    ...position,
    _id: position._id?.toHexString(),
    opportunityId: position.opportunityId.toHexString(),
  };
}

export async function GET() {
  try {
    const positions = await listTestPositions(100);
    return NextResponse.json(
      {
        open: positions.filter((position) => position.status === "OPEN").map(serialize),
        history: positions
          .filter((position) => position.status !== "OPEN")
          .map(serialize),
        all: positions.map(serialize),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load test positions" },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      opportunityId?: unknown;
      initialCapital?: unknown;
      leverage?: unknown;
    };

    if (typeof body.opportunityId !== "string") {
      return NextResponse.json({ error: "opportunityId is required" }, { status: 400 });
    }

    const initialCapital =
      body.initialCapital === undefined ? undefined : Number(body.initialCapital);
    const leverage =
      body.leverage === undefined ? undefined : Number(body.leverage);

    if (
      initialCapital !== undefined &&
      (!Number.isFinite(initialCapital) || initialCapital <= 0)
    ) {
      return NextResponse.json({ error: "Invalid initialCapital" }, { status: 400 });
    }

    if (
      leverage !== undefined &&
      (!Number.isFinite(leverage) || leverage <= 0)
    ) {
      return NextResponse.json({ error: "Invalid leverage" }, { status: 400 });
    }

    const position = await startTestPosition(
      body.opportunityId,
      initialCapital,
      leverage,
    );

    return NextResponse.json({ position: serialize(position) }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to start test position" },
      { status: 400 },
    );
  }
}
