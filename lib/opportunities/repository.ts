import {
  MongoServerError,
  ObjectId,
  type Collection,
} from "mongodb";
import { getMongoDb } from "../mongodb";
import type { OpportunityDocument } from "../opportunity/snapshot";

const COLLECTION_NAME = "opportunities";
let indexesPromise: Promise<void> | undefined;

async function getCollection(): Promise<Collection<OpportunityDocument>> {
  const db = await getMongoDb();
  const collection = db.collection<OpportunityDocument>(COLLECTION_NAME);

  if (!indexesPromise) {
    indexesPromise = collection
      .createIndexes([
        {
          name: "one-open-opportunity",
          key: { status: 1 },
          unique: true,
          partialFilterExpression: { status: "OPEN" },
        },
        { name: "created-at-desc", key: { createdAt: -1 } },
        { name: "status-created-at", key: { status: 1, createdAt: -1 } },
        { name: "outcome-resolved-at", key: { "outcome.resolvedAt": -1 } },
      ])
      .then(() => undefined);
  }

  await indexesPromise;
  return collection;
}

export async function findOpenOpportunity(): Promise<OpportunityDocument | null> {
  const collection = await getCollection();
  return collection.findOne({ status: "OPEN" }, { sort: { createdAt: -1 } });
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
      const existing = await findOpenOpportunity();
      if (existing) return existing;
    }
    throw error;
  }
}

export async function resolveOpportunity(
  id: ObjectId,
  exitPrice: number,
  priceChangePct: number,
  resolvedAt: Date,
  status: "SUCCESS" | "FAILED" | "INVALIDATED",
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

export async function listRecentOpportunities(
  limit = 20,
): Promise<OpportunityDocument[]> {
  const collection = await getCollection();
  return collection
    .find({})
    .sort({ createdAt: -1 })
    .limit(Math.max(1, Math.min(limit, 100)))
    .toArray();
}

export async function getOpportunityStats() {
  const collection = await getCollection();
  const [total, open, successful, failed, invalidated] = await Promise.all([
    collection.countDocuments({}),
    collection.countDocuments({ status: "OPEN" }),
    collection.countDocuments({ status: "SUCCESS" }),
    collection.countDocuments({ status: "FAILED" }),
    collection.countDocuments({ status: "INVALIDATED" }),
  ]);

  const resolved = successful + failed;

  return {
    total,
    open,
    successful,
    failed,
    invalidated,
    successRate: resolved > 0 ? (successful / resolved) * 100 : 0,
  };
}
