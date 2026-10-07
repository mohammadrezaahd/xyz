import { MongoServerError, ObjectId, type Collection } from "mongodb";
import { getMongoDb } from "../mongodb";
import type { SignalDirection, SignalDocument, SignalRisk, SignalStatus } from "./types";

const NAME = "signals";
let indexesPromise: Promise<void> | undefined;
async function collection(): Promise<Collection<SignalDocument>> {
  const c = (await getMongoDb()).collection<SignalDocument>(NAME);
  if (!indexesPromise) indexesPromise = c.createIndexes([
    { name: "signal-key-unique", key: { signalKey: 1 }, unique: true },
    { name: "status-detected", key: { status: 1, detectedAt: -1 } },
    { name: "risk-status", key: { riskLevel: 1, status: 1 } },
    { name: "source-opportunity", key: { sourceOpportunityId: 1 } },
  ]).then(() => undefined);
  await indexesPromise;
  return c;
}
export async function findSignalByKey(signalKey: string) { return (await collection()).findOne({ signalKey }); }
export async function findActiveSignalByKey(signalKey: string) { return (await collection()).findOne({ signalKey, status: { $in: ["ACTIVE", "TRACKED"] } }); }
export async function createSignal(document: SignalDocument) {
  try { const r = await (await collection()).insertOne(document); return { signal: { ...document, _id: r.insertedId }, created: true }; }
  catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      const existing = await findSignalByKey(document.signalKey);
      if (existing) return { signal: existing, created: false };
    }
    throw error;
  }
}
export async function updateSignal(id: ObjectId, patch: Partial<SignalDocument>) {
  const c = await collection();
  await c.updateOne({ _id: id }, { $set: { ...patch, updatedAt: new Date() } });
  return c.findOne({ _id: id });
}
export type SignalFilters = { status?: SignalStatus; riskLevel?: Exclude<SignalRisk, "ALL">; direction?: SignalDirection; from?: Date; to?: Date; limit?: number };
export async function listSignals(filters: SignalFilters = {}) {
  const query: Record<string, unknown> = {};
  if (filters.status) query.status = filters.status;
  if (filters.riskLevel) query.riskLevel = filters.riskLevel;
  if (filters.direction) query.direction = filters.direction;
  if (filters.from || filters.to) query.detectedAt = { ...(filters.from ? { $gte: filters.from } : {}), ...(filters.to ? { $lte: filters.to } : {}) };
  return (await collection()).find(query).sort({ detectedAt: -1 }).limit(Math.min(filters.limit ?? 50, 200)).toArray();
}
export async function getSignalSummary() {
  const signals = await listSignals({ limit: 200 });
  const resolved = signals.filter((s) => ["TARGET_REACHED", "STOPPED", "EXPIRED", "INVALIDATED"].includes(s.status));
  const hits = resolved.filter((s) => s.status === "TARGET_REACHED").length;
  const expectedProfit = signals.map((s) => s.expectedProfit).filter((v): v is number => typeof v === "number");
  const expectedLoss = signals.map((s) => s.expectedLoss).filter((v): v is number => typeof v === "number");
  return {
    active: signals.filter((s) => s.status === "ACTIVE").length,
    tracked: signals.filter((s) => s.status === "TRACKED").length,
    resolved: resolved.length,
    targetHitRate: resolved.length ? hits / resolved.length : null,
    averageExpectedProfit: expectedProfit.length ? expectedProfit.reduce((a, b) => a + b, 0) / expectedProfit.length : null,
    averageExpectedLoss: expectedLoss.length ? expectedLoss.reduce((a, b) => a + b, 0) / expectedLoss.length : null,
    riskDistribution: Object.fromEntries(["LOW", "MEDIUM", "HIGH", "VERY_HIGH"].map((risk) => [risk, signals.filter((s) => s.riskLevel === risk).length])),
  };
}
