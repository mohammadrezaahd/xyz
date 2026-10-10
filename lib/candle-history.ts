import { dedupeSort, parseCandles, type Candle } from "@/lib/candles";
import {
  fetchWallexChunks,
  type WallexChunk,
  type WallexChunkFailure,
} from "@/lib/wallex-candles";

const env = (key: string, fallback = "") => process.env[key] ?? fallback;
const WALLEX_CHUNK_SECONDS = 6 * 60 * 60;

async function fetchBitpin(): Promise<Candle[]> {
  const url = new URL(env("BITPIN_CANDLES_URL"));
  const now = Math.floor(Date.now() / 1000);
  const resolution = env("BITPIN_RESOLUTION", "1");
  const initialDays = Number(env("BITPIN_INITIAL_DAYS", "7"));
  const maxBars = Number(env("BITPIN_MAX_BARS", "10000"));

  const resolutionSeconds: Record<string, number> = {
    "1": 60, "5": 300, "15": 900, "30": 1800,
    "60": 3600, "240": 14400, "1D": 86400, "1W": 604800,
  };

  const stepSeconds = resolutionSeconds[resolution];
  if (!stepSeconds) throw new Error(`Unsupported Bitpin resolution: ${resolution}`);

  const requestedSeconds = Math.max(1, initialDays) * 86400;
  const maxRangeSeconds = Math.max(0, maxBars - 1) * stepSeconds;
  const from = now - Math.min(requestedSeconds, maxRangeSeconds);

  url.searchParams.set(env("BITPIN_CANDLES_SYMBOL_PARAM", "symbol"), env("BITPIN_SYMBOL", "USDT_IRT"));
  url.searchParams.set(env("BITPIN_CANDLES_RESOLUTION_PARAM", "res"), resolution);
  url.searchParams.set(env("BITPIN_CANDLES_FROM_PARAM", "from"), String(from));
  url.searchParams.set(env("BITPIN_CANDLES_TO_PARAM", "to"), String(now));

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Bitpin HTTP ${response.status}: ${body}`);
  }

  const initialCandles = dedupeSort(parseCandles(await response.json()));
  if (initialCandles.length > 10 || requestedSeconds <= 10 * 60) return initialCandles;
  const rangeEnd = Math.floor(now / 60) * 60;
  const rangeStart = rangeEnd - 2 * 60 * 60;
  const chunkSeconds = 10 * 60;
  const chunks: Array<{ from: number; to: number }> = [];
  for (let chunkFrom = rangeStart; chunkFrom < rangeEnd; chunkFrom += chunkSeconds) chunks.push({ from: chunkFrom, to: Math.min(chunkFrom + chunkSeconds, rangeEnd) });
  const historicalChunks = await Promise.all(chunks.map(async (chunk) => {
    const chunkUrl = new URL(url.toString());
    chunkUrl.searchParams.set(env("BITPIN_CANDLES_FROM_PARAM", "from"), String(chunk.from));
    chunkUrl.searchParams.set(env("BITPIN_CANDLES_TO_PARAM", "to"), String(chunk.to));
    try { const chunkResponse = await fetch(chunkUrl, { cache: "no-store" }); if (!chunkResponse.ok) return [] as Candle[]; return dedupeSort(parseCandles(await chunkResponse.json())); } catch { return [] as Candle[]; }
  }));
  const recovered = dedupeSort([...initialCandles, ...historicalChunks.flat()]);
  return recovered.length > initialCandles.length ? recovered : initialCandles;
}

async function fetchWallexChunk(
  baseUrl: string,
  symbol: string,
  resolution: string,
  from: number,
  to: number,
  apiKey: string,
): Promise<Candle[]> {
  const url = new URL(baseUrl);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("resolution", resolution);
  url.searchParams.set("from", String(from));
  url.searchParams.set("to", String(to));

  const response = await fetch(url, {
    headers: { "x-api-key": apiKey },
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(`Wallex HTTP ${response.status}: ${JSON.stringify(payload)}`);
  }

  if (payload?.s === "error") {
    throw new Error(payload?.errmsg ?? "Wallex returned an error");
  }

  if (payload?.s === "no_data") {
    return [];
  }

  return dedupeSort(parseCandles(payload));
}

async function fetchWallex(): Promise<{
  candles: Candle[];
  failures: WallexChunkFailure[];
}> {
  const baseUrl = env(
    "WALLEX_CANDLES_URL",
    "https://api.wallex.ir/v1/udf/history",
  );
  const symbol = env("WALLEX_SYMBOL", "USDTTMN");
  const resolution = env("WALLEX_RESOLUTION", "1");
  const days = Math.max(1, Number(env("WALLEX_INITIAL_DAYS", "20")));
  const apiKey = env("WALLEX_API_KEY");

  if (!apiKey) {
    throw new Error("Wallex API key is not configured");
  }

  const now = Math.floor(Date.now() / 1000);
  const from = now - days * 86400;
  const chunks: WallexChunk[] = [];

  for (
    let chunkFrom = from;
    chunkFrom < now;
    chunkFrom += WALLEX_CHUNK_SECONDS
  ) {
    chunks.push({
      from: chunkFrom,
      to: Math.min(chunkFrom + WALLEX_CHUNK_SECONDS, now),
    });
  }

  const result = await fetchWallexChunks(
    chunks,
    (chunk) =>
      fetchWallexChunk(
        baseUrl,
        symbol,
        resolution,
        chunk.from,
        chunk.to,
        apiKey,
      ),
    4,
  );

  return {
    candles: dedupeSort(result.candles),
    failures: result.failures,
  };
}

async function fetchCandleHistory() {
  const [bitpin, wallex] = await Promise.allSettled([
    fetchBitpin(),
    fetchWallex(),
  ]);

  const errors: string[] = [];

  const bitpinData = bitpin.status === "fulfilled"
    ? bitpin.value
    : (errors.push(`Bitpin: ${String(bitpin.reason)}`), []);

  const wallexData =
    wallex.status === "fulfilled"
      ? wallex.value.candles
      : (errors.push(`Wallex historical candles: ${String(wallex.reason)}`), []);

  const wallexChunkFailures =
    wallex.status === "fulfilled" ? wallex.value.failures : [];

  if (wallexChunkFailures.length > 0) {
    const failedRanges = wallexChunkFailures
      .map((failure) => `${failure.from}-${failure.to}`)
      .join(", ");

    errors.push(
      `Wallex historical candles: ${wallexChunkFailures.length} chunk(s) failed (${failedRanges}). Successful chunks were retained.`,
    );
  }

  const fetchedAt = Date.now();
  const staleThresholdMs = 180_000;
  function candleFreshness(data: Candle[]) {
    const latest = data.reduce<Candle | null>((current, candle) => !current || candle.time > current.time ? candle : current, null);
    const latestCandleTime = latest?.time ?? null;
    const ageMs = latestCandleTime === null ? null : Math.max(0, fetchedAt - (latestCandleTime + 60) * 1000);
    return {
      latestCandleTime,
      ageMs,
      staleThresholdMs,
      stale: ageMs === null || ageMs > staleThresholdMs,
    };
  }
  const bitpinFreshness = candleFreshness(bitpinData);
  const wallexFreshness = candleFreshness(wallexData);

  return {
    bitpin: bitpinData,
    wallex: wallexData,
    errors,
    providers: {
      bitpinHistorical: bitpin.status !== "fulfilled" || bitpinData.length === 0 ? "FAILED" : bitpinData.length <= 10 ? "LIMITED_OR_INCOMPLETE" : bitpinFreshness.stale ? "STALE" : "SUCCESS",
      wallexHistorical:
        wallex.status !== "fulfilled"
          ? "FAILED"
          : wallexChunkFailures.length > 0
            ? wallexData.length > 0 ? "PARTIAL" : "FAILED"
            : wallexFreshness.stale ? "STALE" : "SUCCESS",
    },
    diagnostics: {
      bitpinReceived: bitpinData.length,
      wallexReceived: wallexData.length,
      bitpin: bitpinFreshness,
      wallex: wallexFreshness,
      wallexChunkFailures: wallexChunkFailures.length,
    },
    fetchedAt,
    refreshMs: Number(env("CANDLE_REFRESH_MS", "15000")),
  };
}

type CandleHistoryPayload = Awaited<ReturnType<typeof fetchCandleHistory>>;
let cachedHistory: { expiresAt: number; payload: CandleHistoryPayload } | null = null;
let historyRequest: Promise<CandleHistoryPayload> | null = null;

/**
 * Research endpoints often need the same candles concurrently. Share one short-lived
 * result so a single dashboard refresh does not multiply exchange API requests.
 */
export async function loadCandleHistory(): Promise<CandleHistoryPayload> {
  const now = Date.now();
  if (cachedHistory && cachedHistory.expiresAt > now) return cachedHistory.payload;
  if (historyRequest) return historyRequest;

  historyRequest = fetchCandleHistory();
  try {
    const payload = await historyRequest;
    cachedHistory = { payload, expiresAt: Date.now() + 12_000 };
    return payload;
  } finally {
    historyRequest = null;
  }
}
