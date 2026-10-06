import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { parsePositivePrice } from "@/lib/prices";
import {
  calculateLeveragedPnl,
  createPositionSimulation,
} from "@/lib/opportunity/position";
import {
  closeOpportunity,
  findOpenOpportunity,
} from "@/lib/opportunities/repository";

export const dynamic = "force-dynamic";

async function fetchCurrentBitpinPrice(
  request: Request,
): Promise<number | null> {
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  const origin = productionHost
    ? `https://${productionHost}`
    : new URL(request.url).origin;

  const response = await fetch(new URL("/api/prices", origin), {
    cache: "no-store",
  });

  const payload = (await response.json()) as {
    bitpin?: unknown;
    errors?: string[];
  };

  if (!response.ok) {
    throw new Error(
      payload.errors?.join("; ") ?? `Price API HTTP ${response.status}`,
    );
  }

  return parsePositivePrice(payload.bitpin);
}

export async function POST(
  request: Request,
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

    const open = await findOpenOpportunity();

    if (!open?._id || open._id.toHexString() !== id) {
      return NextResponse.json(
        { error: "No matching OPEN opportunity was found." },
        { status: 404 },
      );
    }

    const currentBitpinPrice = await fetchCurrentBitpinPrice(request);

    if (currentBitpinPrice === null) {
      return NextResponse.json(
        { error: "Current Bitpin price is unavailable." },
        { status: 503 },
      );
    }

    const simulation =
      open.simulation ??
      createPositionSimulation(open.entry.price, open.target.price);
    const pnl = calculateLeveragedPnl(
      open.entry.price,
      currentBitpinPrice,
      simulation,
    );
    const closedAt = new Date();

    const updated = await closeOpportunity(
      open._id,
      currentBitpinPrice,
      pnl,
      closedAt,
    );

    if (!updated) {
      return NextResponse.json(
        { error: "Opportunity was already closed or resolved." },
        { status: 409 },
      );
    }

    return NextResponse.json({
      ok: true,
      action: "CLOSED_MANUALLY",
      opportunityId: id,
      exitPrice: currentBitpinPrice,
      pnl,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to close opportunity",
      },
      { status: 500 },
    );
  }
}
