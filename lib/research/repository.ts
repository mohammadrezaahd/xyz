import { MongoServerError, ObjectId, type Collection, type Filter } from "mongodb";
import { getMongoDb } from "../mongodb";
import type { ResearchObservation, ResearchObservationActual, ResearchObservationSource, ResearchObservationStatus } from "./types";

const COLLECTION_NAME = "researchObservations";
let indexesPromise: Promise<void> | undefined;

async function getCollection(): Promise<Collection<ResearchObservation>> {
  const collection = (await getMongoDb()).collection<ResearchObservation>(COLLECTION_NAME);
  if (!indexesPromise) {
    indexesPromise = collection.createIndexes([
      { name: "observation-key-unique", key: { observationKey: 1 }, unique: true },
      { name: "source-opportunity", key: { sourceOpportunityId: 1 } },
      { name: "paper-position", key: { paperPositionId: 1 } },
      { name: "detected-at-desc", key: { detectedAt: -1 } },
      { name: "status-detected-at", key: { status: 1, detectedAt: -1 } },
      { name: "created-at-desc", key: { createdAt: -1 } },
    ]).then(() => undefined);
  }
  await indexesPromise;
  return collection;
}

export async function createResearchObservation(document: ResearchObservation): Promise<{ observation: ResearchObservation; created: boolean }> {
  const collection = await getCollection();
  try {
    const result = await collection.insertOne(document);
    return { observation: { ...document, _id: result.insertedId }, created: true };
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      const existing = await collection.findOne({ observationKey: document.observationKey });
      if (existing) return { observation: existing, created: false };
    }
    throw error;
  }
}

export async function findResearchObservationByKey(observationKey: string): Promise<ResearchObservation | null> {
  return (await getCollection()).findOne({ observationKey });
}

export async function findResearchObservationBySourceOpportunityId(sourceOpportunityId: ObjectId): Promise<ResearchObservation | null> {
  return (await getCollection()).findOne({ sourceOpportunityId }, { sort: { detectedAt: -1 } });
}

export async function findResearchObservationByPaperPositionId(paperPositionId: ObjectId): Promise<ResearchObservation | null> {
  return (await getCollection()).findOne({ paperPositionId });
}

export async function linkSourceOpportunity(id: ObjectId, sourceOpportunityId: ObjectId, updatedAt = new Date()): Promise<boolean> {
  const result = await (await getCollection()).updateOne(
    { _id: id, sourceOpportunityId: null },
    { $set: { sourceOpportunityId, updatedAt } },
  );
  return result.modifiedCount === 1;
}

export async function linkPaperPosition(
  observationId: ObjectId,
  paperPositionId: ObjectId,
  startedAt: Date,
): Promise<"linked" | "already-linked" | "missing" | "conflict" | "resolved"> {
  const collection = await getCollection();
  const observation = await collection.findOne({ _id: observationId });
  if (!observation) return "missing";
  if (observation.paperPositionId) {
    return observation.paperPositionId.equals(paperPositionId) ? "already-linked" : "conflict";
  }
  if (observation.status === "RESOLVED") return "resolved";
  const result = await collection.updateOne(
    { _id: observationId, paperPositionId: null, status: { $in: ["DETECTED", "PAPER_STARTED"] } },
    { $set: { paperPositionId, paperPositionStartedAt: startedAt, status: "PAPER_STARTED", updatedAt: startedAt } },
  );
  return result.modifiedCount === 1 ? "linked" : "missing";
}

export async function resolveResearchObservation(
  paperPositionId: ObjectId,
  actual: ResearchObservationActual,
  resolvedAt: Date,
): Promise<"resolved" | "already-resolved" | "missing"> {
  const collection = await getCollection();
  const existing = await collection.findOne({ paperPositionId });
  if (!existing) return "missing";
  if (existing.actual.resolvedAt || existing.status === "RESOLVED") return "already-resolved";
  const result = await collection.updateOne(
    { _id: existing._id, paperPositionId, status: "PAPER_STARTED", "actual.resolvedAt": null },
    { $set: { actual, status: "RESOLVED", updatedAt: resolvedAt } },
  );
  return result.modifiedCount === 1 ? "resolved" : "already-resolved";
}

export type ResearchObservationFilters = {
  status?: ResearchObservationStatus;
  source?: ResearchObservationSource;
  from?: Date;
  to?: Date;
  limit?: number;
};

export async function listResearchObservations(filters: ResearchObservationFilters = {}): Promise<ResearchObservation[]> {
  const query: Filter<ResearchObservation> = {};
  if (filters.status) query.status = filters.status;
  if (filters.source) query.source = filters.source;
  if (filters.from || filters.to) query.detectedAt = { ...(filters.from ? { $gte: filters.from } : {}), ...(filters.to ? { $lte: filters.to } : {}) };
  return (await getCollection())
    .find(query)
    .sort({ detectedAt: -1 })
    .limit(Math.max(1, Math.min(filters.limit ?? 50, 100)))
    .toArray();
}

export async function countResearchObservations(filters: Omit<ResearchObservationFilters, "limit"> = {}): Promise<number> {
  const query: Filter<ResearchObservation> = {};
  if (filters.status) query.status = filters.status;
  if (filters.source) query.source = filters.source;
  if (filters.from || filters.to) query.detectedAt = { ...(filters.from ? { $gte: filters.from } : {}), ...(filters.to ? { $lte: filters.to } : {}) };
  return (await getCollection()).countDocuments(query);
}

export async function getResearchSummary(): Promise<{
  totalObservations: number;
  detected: number;
  paperStarted: number;
  resolved: number;
  withOutcomes: number;
  withoutPaperTest: number;
  targetHits: number;
  liquidations: number;
  manualCloses: number;
  averageNetPnl: number | null;
  averageDurationMs: number | null;
}> {
  const collection = await getCollection();
  const [summary] = await collection.aggregate<{
    totalObservations: number;
    detected: number;
    paperStarted: number;
    resolved: number;
    withOutcomes: number;
    withoutPaperTest: number;
    targetHits: number;
    liquidations: number;
    manualCloses: number;
    averageNetPnl: number | null;
    averageDurationMs: number | null;
  }>([
    { $group: {
      _id: null,
      totalObservations: { $sum: 1 },
      detected: { $sum: { $cond: [{ $eq: ["$status", "DETECTED"] }, 1, 0] } },
      paperStarted: { $sum: { $cond: [{ $eq: ["$status", "PAPER_STARTED"] }, 1, 0] } },
      resolved: { $sum: { $cond: [{ $eq: ["$status", "RESOLVED"] }, 1, 0] } },
      withOutcomes: { $sum: { $cond: [{ $ne: ["$actual.resolvedAt", null] }, 1, 0] } },
      withoutPaperTest: { $sum: { $cond: [{ $eq: ["$paperPositionId", null] }, 1, 0] } },
      targetHits: { $sum: { $cond: [{ $eq: ["$actual.result", "PREDICT_SUCCESS"] }, 1, 0] } },
      liquidations: { $sum: { $cond: [{ $eq: ["$actual.result", "LIQUIDATED"] }, 1, 0] } },
      manualCloses: { $sum: { $cond: [{ $eq: ["$actual.exitReason", "MANUAL_CLOSE"] }, 1, 0] } },
      averageNetPnl: { $avg: "$actual.netPnl" },
      averageDurationMs: { $avg: "$actual.durationMs" },
    } },
    { $project: { _id: 0 } },
  ]).toArray();
  return summary ?? { totalObservations: 0, detected: 0, paperStarted: 0, resolved: 0, withOutcomes: 0, withoutPaperTest: 0, targetHits: 0, liquidations: 0, manualCloses: 0, averageNetPnl: null, averageDurationMs: null };
}
