import type { SignalDocument } from "./types";
function serialize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object" && "toHexString" in value && typeof (value as { toHexString?: unknown }).toHexString === "function") return (value as { toHexString: () => string }).toHexString();
  return value;
}
export function serializeSignal(signal: SignalDocument | SignalDocument[]) {
  const one = (item: SignalDocument) => Object.fromEntries(Object.entries(item).map(([key, value]) => [key, serialize(value)]));
  return Array.isArray(signal) ? signal.map(one) : one(signal);
}
