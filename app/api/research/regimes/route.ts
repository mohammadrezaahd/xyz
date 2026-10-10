import { NextResponse } from "next/server";
import { dedupeSort, type Candle } from "@/lib/candles";
import { listResearchObservations } from "@/lib/research/repository";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const HORIZONS = [5, 15, 30] as const;
type Band = { label: string; min: number; max: number };
const BANDS: Band[] = [
  { label: "0–39", min: 0, max: 40 },
  { label: "40–59", min: 40, max: 60 },
  { label: "60–79", min: 60, max: 80 },
  { label: "80–100", min: 80, max: 101 },
];

type CandlePayload = { bitpin?: Candle[]; errors?: string[]; providers?: Record<string, string>; diagnostics?: Record<string, unknown> };

export async function GET(request: Request) {
  try {
    const origin = new URL(request.url).origin;
    const [candleResponse, observations] = await Promise.all([
      fetch(new URL("/api/candles", origin), { cache: "no-store" }),
      listResearchObservations({ limit: 100 }),
    ]);
    const candlePayload = await candleResponse.json().catch(() => null) as CandlePayload | null;
    if (!candleResponse.ok || !candlePayload) {
      return NextResponse.json({ ok: false, error: "Unable to load candle history" }, { status: 502 });
    }
    const candles = dedupeSort(candlePayload.bitpin ?? []);
    const byTime = new Map(candles.map((candle) => [candle.time, candle]));
    const usableObservations = observations.filter((item) =>
      Number.isFinite(item.prediction?.stabilityScore) &&
      item.prediction.stabilityScore >= 0 &&
      item.prediction.stabilityScore <= 100 &&
      item.detectedAt instanceof Date,
    );
    const horizons = HORIZONS.map((horizonMinutes) => {
      const outcomes: Array<{ score: number; returnPct: number; rangePct: number }> = [];
      for (const observation of usableObservations) {
        const startTime = Math.floor(observation.detectedAt.getTime() / 60_000) * 60;
        const start = byTime.get(startTime);
        const end = byTime.get(startTime + horizonMinutes * 60);
        if (!start || !end || start.close <= 0) continue;
        const window: Candle[] = [];
        let contiguous = true;
        for (let time = startTime; time <= startTime + horizonMinutes * 60; time += 60) {
          const candle = byTime.get(time);
          if (!candle) { contiguous = false; break; }
          window.push(candle);
        }
        if (!contiguous || window.length !== horizonMinutes + 1) continue;
        const highs = window.slice(1).map((candle) => candle.high);
        const lows = window.slice(1).map((candle) => candle.low);
        const high = Math.max(...highs);
        const low = Math.min(...lows);
        outcomes.push({
          score: observation.prediction.stabilityScore,
          returnPct: (end.close / start.close - 1) * 100,
          rangePct: start.close > 0 ? (high - low) / start.close * 100 : 0,
        });
      }
      const bands = BANDS.map((band) => {
        const rows = outcomes.filter((row) => row.score >= band.min && row.score < band.max);
        return {
          label: band.label,
          samples: rows.length,
          meanAbsoluteReturnPct: rows.length ? rows.reduce((sum, row) => sum + Math.abs(row.returnPct), 0) / rows.length : null,
          medianAbsoluteReturnPct: (() => {
            if (!rows.length) return null;
            const values = rows.map((row) => Math.abs(row.returnPct)).sort((a, b) => a - b);
            const middle = Math.floor(values.length / 2);
            return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
          })(),
          meanFutureRangePct: rows.length ? rows.reduce((sum, row) => sum + row.rangePct, 0) / rows.length : null,
          directionalMoveRate: rows.length ? rows.filter((row) => Math.abs(row.returnPct) >= 0.02).length / rows.length : null,
        };
      });
      return { horizonMinutes, matchedObservations: outcomes.length, bands };
    });
    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      observationCount: observations.length,
      usableObservationCount: usableObservations.length,
      matchedObservationCount: Math.max(0, ...horizons.map((item) => item.matchedObservations)),
      providerStatus: candlePayload.providers ?? {},
      providerErrors: candlePayload.errors ?? [],
      horizons,
      interpretation: "This is a retrospective association, not causal proof. Stability observations are matched to subsequent Bitpin candles only when the full minute window is present. Small samples are descriptive only.",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Unable to evaluate stability regimes",
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
