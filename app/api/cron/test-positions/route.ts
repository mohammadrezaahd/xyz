import { NextResponse } from "next/server";
import { fetchBitpinPrice } from "@/lib/bitpin";
import { isCronAuthorized } from "@/lib/opportunity/cron-auth";
import {
  monitorOpenTestPositions,
  recordMonitoringFailure,
} from "@/lib/test-position/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (
    !isCronAuthorized(
      request.headers.get("authorization"),
      process.env.CRON_SECRET,
    )
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const checkedAt = new Date();

  try {
    const currentPrice = await fetchBitpinPrice();
    const result = await monitorOpenTestPositions(currentPrice, checkedAt);

    return NextResponse.json({
      ok: true,
      currentBitpinPrice: currentPrice,
      ...result,
    });
  } catch (error) {
    const affected = await recordMonitoringFailure(
      checkedAt,
      error instanceof Error ? error.message : "Bitpin ticker unavailable",
    );

    return NextResponse.json(
      {
        ok: false,
        action: "PRICE_UNAVAILABLE",
        openPositions: affected,
        error: error instanceof Error ? error.message : "Bitpin ticker unavailable",
      },
      { status: 503 },
    );
  }
}
