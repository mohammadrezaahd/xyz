import { MongoServerError, ObjectId, type Collection, type Filter } from "mongodb";
import { getMongoDb } from "../mongodb";
import type { SignalDocument, SignalStatus } from "./types";
const COLLECTION = "signals";
let indexes: Promise<void> | undefined;
async function collection(): Promise<Collection<SignalDocument>> {
  const c = (await getMongoDb()).collection<SignalDocument>(COLLECTION);
  indexes ??= c.createIndexes([
    { name: "signal-key-unique", key: { signalKey: 1 }, unique: true },
    { name: "active-signal-unique", key: { sourceResearchObservationId: 1 }, unique: true, partialFilterExpression: { status: "ACTIVE" } },
    { name: "status-detected", key: { status: 1, detectedAt: -1 } },
  ]).then(() => undefined);
  await indexes; return c;
}
export async function insertSignal(document: SignalDocument): Promise<{ signal: SignalDocument; created: boolean }> {
  try { const result = await (await collection()).insertOne(document); return { signal: { ...document, _id: result.insertedId }, created: true }; }
  catch (error) { if (error instanceof MongoServerError && error.code === 11000) { const existing = await (await collection()).findOne({ signalKey: document.signalKey }); if (existing) return { signal: existing, created: false }; } throw error; }
}
export async function findActiveSignalByObservationId(id: ObjectId): Promise<SignalDocument | null> { return (await collection()).findOne({ sourceResearchObservationId: id, status: "ACTIVE" }); }
export type SignalFilters = { status?: SignalStatus; riskLevel?: string; direction?: string; from?: Date; to?: Date; limit?: number };
export async function listSignals(filters: SignalFilters = {}): Promise<SignalDocument[]> { const query: Filter<SignalDocument> = {}; if (filters.status) query.status = filters.status; if (filters.riskLevel) query.riskLevel = filters.riskLevel; if (filters.direction) query.buySellBalance = { $exists: true } as never; if (filters.from || filters.to) query.detectedAt = { ...(filters.from ? { $gte: filters.from } : {}), ...(filters.to ? { $lte: filters.to } : {}) }; return (await collection()).find(query).sort({ detectedAt: -1 }).limit(Math.max(1, Math.min(filters.limit ?? 50, 100))).toArray(); }
export async function expireSignals(now = new Date()): Promise<number> { const result = await (await collection()).updateMany({ status: "ACTIVE", expiresAt: { $lte: now } }, { $set: { status: "EXPIRED", actualResult: "EXPIRED", resolvedAt: now, lastCheckedAt: now } }); return result.modifiedCount; }
export async function resolveSignal(id: ObjectId, status: "RESOLVED" | "INVALIDATED", currentPrice: number | null, actualNetPnl: number | null, now = new Date()): Promise<boolean> { const result = await (await collection()).updateOne({ _id: id, status: "ACTIVE" }, { $set: { status, actualResult: status === "RESOLVED" ? "TARGET_REACHED" : "INVALIDATED", currentPrice, actualNetPnl, resolvedAt: now, lastCheckedAt: now } }); return result.modifiedCount === 1; }
export async function updateSignalMonitoring(id: ObjectId, currentPrice: number | null, now = new Date()): Promise<boolean> { const result = await (await collection()).updateOne({ _id: id, status: "ACTIVE" }, { $set: { currentPrice, lastCheckedAt: now } }); return result.modifiedCount === 1; }
