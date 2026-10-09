import {
  MongoServerError,
  ObjectId,
  type Collection,
} from "mongodb";
import { getMongoDb } from "../mongodb";
import type { OpportunityDocument } from "../opportunity/snapshot";
import type { LeveragedPnl } from "../opportunity/position";

const COLLECTION_NAME = "opportunities";
let indexesPromise: Promise<void> | undefined;

async function getCollection(): Promise<Collection<OpportunityDocument>> {
  const db = await getMongoDb();
  const collection = db.collection<OpportunityDocument>(COLLECTION_NAME);

  if (!indexesPromise) {
    indexesPromise = collection.dropIndex("one-open-opportunity").catch(() => undefined).then(() => collection.createIndexes([
        { name: "identity-key-unique", key: { identityKey: 1 }, unique: true, sparse: true },
        { name: "created-at-desc", key: { createdAt: -1 } },
        { name: "status-created-at", key: { status: 1, createdAt: -1 } },
        { name: "outcome-resolved-at", key: { "outcome.resolvedAt": -1 } },
      ]))
      .then(() => undefined);
  }

  await indexesPromise;
  return collection;
}

export async function findOpportunityById(id: ObjectId): Promise<OpportunityDocument | null> {
  return (await getCollection()).findOne({ _id: id });
}
export async function findOpenOpportunity(): Promise<OpportunityDocument | null> {
  return (await listOpenOpportunities(1))[0] ?? null;
}
export async function listOpenOpportunities(limit = 100): Promise<OpportunityDocument[]> {
  return (await getCollection()).find({ status: "OPEN" }).sort({ createdAt: 1 }).limit(Math.max(1, Math.min(limit, 500))).toArray();
}
export async function findOpportunityByObservationKey(identityKey: string): Promise<OpportunityDocument | null> {
  return (await getCollection()).findOne({ identityKey });
}

export async function insertOpenOpportunity(
  document: OpportunityDocument,
): Promise<OpportunityDocument> {
  const collection = await getCollection();

  try {
    const result = await collection.insertOne(document);
    return { ...document, _id: result.insertedId };
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      const existing = document.identityKey ? await findOpportunityByObservationKey(document.identityKey) : null;
      if (existing) return existing;
    }
    throw error;
  }
}

export async function updateOpenMonitoring(
  id: ObjectId,
  currentBitpinPrice: number | null,
  updatedAt: Date,
): Promise<boolean> {
  const collection = await getCollection();
  const result = await collection.updateOne(
    { _id: id, status: "OPEN" },
    {
      $set: {
        "monitoring.currentBitpinPrice": currentBitpinPrice,
        "monitoring.updatedAt": updatedAt,
        updatedAt,
      },
    },
  );
  return result.modifiedCount === 1;
}

export async function resolveOpportunity(
  id: ObjectId,
  exitPrice: number,
  priceChangePct: number,
  resolvedAt: Date,
  status: "SUCCESS" | "FAILED",
  pnl: Pick<LeveragedPnl, "grossPnlToman" | "totalFeesToman" | "netPnlToman" | "netPnlPct">,
): Promise<boolean> {
  const collection = await getCollection();
  const result = await collection.updateOne(
    { _id: id, status: "OPEN" },
    {
      $set: {
        status,
        updatedAt: resolvedAt,
        "outcome.status": status,
        "outcome.resolvedAt": resolvedAt,
        "outcome.exitPrice": exitPrice,
        "outcome.priceChangePct": priceChangePct,
        "outcome.grossPnlToman": pnl.grossPnlToman,
        "outcome.totalFeesToman": pnl.totalFeesToman,
        "outcome.netPnlToman": pnl.netPnlToman,
        "outcome.netPnlPct": pnl.netPnlPct,
      },
    },
  );
  return result.modifiedCount === 1;
}

export async function invalidateOpportunity(
  id: ObjectId,
  resolvedAt: Date,
): Promise<boolean> {
  const collection = await getCollection();
  const result = await collection.updateOne(
    { _id: id, status: "OPEN" },
    {
      $set: {
        status: "INVALIDATED",
        updatedAt: resolvedAt,
        "outcome.status": "INVALIDATED",
        "outcome.resolvedAt": resolvedAt,
      },
    },
  );
  return result.modifiedCount === 1;
}

export async function closeOpportunity(
  id: ObjectId,
  exitPrice: number,
  pnl: LeveragedPnl,
  priceChangePct: number,
  closedAt: Date,
): Promise<boolean> {
  const collection = await getCollection();
  const result = await collection.updateOne(
    { _id: id, status: "OPEN" },
    {
      $set: {
        status: "CLOSED",
        updatedAt: closedAt,
        "monitoring.currentBitpinPrice": exitPrice,
        "monitoring.updatedAt": closedAt,
        "outcome.status": "CLOSED",
        "outcome.resolvedAt": closedAt,
        "outcome.exitPrice": exitPrice,
        "outcome.priceChangePct": priceChangePct,
        "outcome.grossPnlToman": pnl.grossPnlToman,
        "outcome.totalFeesToman": pnl.totalFeesToman,
        "outcome.netPnlToman": pnl.netPnlToman,
        "outcome.netPnlPct": pnl.netPnlPct,
      },
    },
  );
  return result.modifiedCount === 1;
}

export type OpportunityHistoryStatus =
  | "OPEN"
  | "SUCCESS"
  | "FAILED"
  | "INVALIDATED"
  | "CLOSED";

export async function listRecentOpportunities(
  limit = 20,
  status?: OpportunityHistoryStatus,
): Promise<OpportunityDocument[]> {
  const collection = await getCollection();
  const filter = status ? { status } : {};
  return collection
    .find(filter)
    .sort({ createdAt: -1 })
    .limit(Math.max(1, Math.min(limit, 100)))
    .toArray();
}

export async function deleteOpportunity(id: ObjectId): Promise<"deleted" | "open" | "missing"> {
  const collection = await getCollection();
  const result = await collection.deleteOne({
    _id: id,
    status: { $ne: "OPEN" },
  });

  if (result.deletedCount === 1) return "deleted";

  const existing = await collection.findOne({ _id: id }, { projection: { status: 1 } });
  if (existing?.status === "OPEN") return "open";
  return "missing";
}

export async function deleteOpportunities(
  ids: ObjectId[],
): Promise<{ deletedCount: number; openIds: string[]; missingCount: number }> {
  const collection = await getCollection();
  const uniqueIds = [...new Map(ids.map((id) => [id.toHexString(), id])).values()];

  if (uniqueIds.length === 0) {
    return { deletedCount: 0, openIds: [], missingCount: 0 };
  }

  const open = await collection
    .find(
      { _id: { $in: uniqueIds }, status: "OPEN" },
      { projection: { _id: 1 } },
    )
    .toArray();
  const openIds = open.map((item) => item._id.toHexString());

  const result = await collection.deleteMany({
    _id: { $in: uniqueIds },
    status: { $ne: "OPEN" },
  });

  return {
    deletedCount: result.deletedCount,
    openIds,
    missingCount: uniqueIds.length - openIds.length - result.deletedCount,
  };
}

export async function getOpportunityStats() {
  const collection = await getCollection();
  const [total, open, successful, failed, invalidated, closed] = await Promise.all([
    collection.countDocuments({}),
    collection.countDocuments({ status: "OPEN" }),
    collection.countDocuments({ status: "SUCCESS" }),
    collection.countDocuments({ status: "FAILED" }),
    collection.countDocuments({ status: "INVALIDATED" }),
    collection.countDocuments({ status: "CLOSED" }),
  ]);

  const resolved = successful + failed;

  return {
    total,
    open,
    successful,
    failed,
    invalidated,
    closed,
    resolved,
    successRate: resolved > 0 ? successful / resolved : null,
  };
}
