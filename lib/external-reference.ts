import { parsePositivePrice } from "./prices";
import type { ExternalReferencePrice } from "./opportunity/types";

function configuredTimeout(): number {
  const value = Number(process.env.EXTERNAL_REFERENCE_TIMEOUT_MS ?? "2500");
  return Number.isFinite(value) ? Math.min(10_000, Math.max(250, value)) : 2_500;
}

function readPath(value: unknown, path: string): unknown {
  return path.split(".").filter(Boolean).reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[key];
  }, value);
}

function findFirst(value: unknown, keys: string[]): unknown {
  if (!value || typeof value !== "object") return undefined;
  const object = value as Record<string, unknown>;
  for (const key of keys) if (object[key] !== undefined) return object[key];
  for (const child of Object.values(object)) {
    const found = findFirst(child, keys);
    if (found !== undefined) return found;
  }
  return undefined;
}

export async function fetchExternalReferencePrice(): Promise<ExternalReferencePrice> {
  const urlValue = process.env.EXTERNAL_REFERENCE_URL?.trim();
  const provider = process.env.EXTERNAL_REFERENCE_PROVIDER?.trim() || null;
  if (!urlValue || !provider) {
    return { price: null, fetchedAt: null, provider: null, error: "Independent external reference unavailable" };
  }
  try {
    const response = await fetch(urlValue, {
      cache: "no-store",
      signal: AbortSignal.timeout(configuredTimeout()),
      headers: { accept: "application/json" },
    });
    const payload = await response.json().catch(() => null);
    const fetchedAt = Date.now();
    if (!response.ok) {
      return { price: null, fetchedAt, provider, error: `External reference HTTP ${response.status}` };
    }
    const path = process.env.EXTERNAL_REFERENCE_PRICE_PATH?.trim();
    const rawPrice = path ? readPath(payload, path) : findFirst(payload, ["price", "lastPrice", "last", "value"]);
    const price = parsePositivePrice(rawPrice);
    if (price === null) return { price: null, fetchedAt, provider, error: "External reference returned no valid price" };
    const rawTimestamp = path ? undefined : findFirst(payload, ["fetchedAt", "timestamp", "time", "updatedAt"]);
    const parsedTimestamp = typeof rawTimestamp === "string" ? Date.parse(rawTimestamp) : Number(rawTimestamp);
    const sourceTimestamp = Number.isFinite(parsedTimestamp) && parsedTimestamp > 0
      ? (parsedTimestamp < 2_000_000_000 ? parsedTimestamp * 1000 : parsedTimestamp)
      : fetchedAt;
    return { price, fetchedAt: sourceTimestamp, provider, error: null };
  } catch (error) {
    return { price: null, fetchedAt: null, provider, error: error instanceof Error ? `External reference: ${error.message}` : "External reference unavailable" };
  }
}
