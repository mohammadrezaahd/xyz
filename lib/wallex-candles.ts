import type { Candle } from "./candles";

export type WallexChunk = {
  from: number;
  to: number;
};

export type WallexChunkFailure = WallexChunk & {
  error: string;
};

export async function fetchWallexChunks(
  chunks: WallexChunk[],
  fetchChunk: (chunk: WallexChunk) => Promise<Candle[]>,
  concurrency = 4,
): Promise<{
  candles: Candle[];
  failures: WallexChunkFailure[];
}> {
  const safeConcurrency = Math.max(1, Math.min(concurrency, chunks.length || 1));
  const candles: Candle[] = [];
  const failures: WallexChunkFailure[] = [];
  let nextIndex = 0;

  const worker = async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= chunks.length) return;

      const chunk = chunks[index];

      try {
        candles.push(...await fetchChunk(chunk));
      } catch (error) {
        failures.push({
          ...chunk,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };

  await Promise.all(
    Array.from({ length: safeConcurrency }, () => worker()),
  );

  return { candles, failures };
}
