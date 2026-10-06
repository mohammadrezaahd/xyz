import { NextResponse } from "next/server";
import { fetchBitpinPrice } from "@/lib/bitpin";
import { parsePositivePrice } from "@/lib/prices";

const env = (key: string, fallback = "") => process.env[key] ?? fallback;

async function fetchWallexPrice(): Promise<number> {
  const baseUrl = env(
    "WALLEX_API_BASE_URL",
    "https://api.wallex.ir",
  );
  const url = new URL(`${baseUrl}/v1/otc/markets`);
  const symbol = env("WALLEX_SYMBOL", "USDTTMN");
  const apiKey = env("WALLEX_API_KEY");

  if (!apiKey) {
    throw new Error("Wallex API key is not configured");
  }

  const response = await fetch(url, {
    headers: {
      "x-api-key": apiKey,
    },
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      `Wallex markets HTTP ${response.status}: ${JSON.stringify(payload)}`,
    );
  }

  const symbolData =
    typeof payload === "object" &&
    payload !== null &&
    typeof (payload as Record<string, unknown>).result === "object"
      ? (
          (payload as Record<string, unknown>).result as Record<
            string,
            unknown
          >
        )[symbol]
      : null;

  const stats =
    typeof symbolData === "object" &&
    symbolData !== null &&
    typeof (symbolData as Record<string, unknown>).stats === "object"
      ? (symbolData as Record<string, unknown>).stats
      : null;

  const price =
    typeof stats === "object" && stats !== null
      ? parsePositivePrice(
          (stats as Record<string, unknown>).lastPrice,
        )
      : null;

  if (price === null) {
    throw new Error(
      "Wallex markets response did not contain a valid USDTTMN lastPrice",
    );
  }

  return price;
}

export async function GET() {
  const [bitpin, wallex] = await Promise.allSettled([
    fetchBitpinPrice(),
    fetchWallexPrice(),
  ]);

  const errors: string[] = [];

  const bitpinPrice =
    bitpin.status === "fulfilled"
      ? bitpin.value
      : (errors.push(`Bitpin ticker: ${String(bitpin.reason)}`), null);

  const wallexPrice =
    wallex.status === "fulfilled"
      ? wallex.value
      : (errors.push(`Wallex ticker: ${String(wallex.reason)}`), null);

  return NextResponse.json({
    bitpin: bitpinPrice,
    wallex: wallexPrice,
    fetchedAt: Date.now(),
    errors,
  });
}
