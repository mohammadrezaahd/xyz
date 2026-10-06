import { ObjectId, type Collection } from "mongodb";
import { getMongoDb } from "../mongodb";
import type { TestPositionDocument } from "./types";

const COLLECTION_NAME = "testPositions";
let indexesPromise: Promise<void> | undefined;

async function getCollection(): Promise<Collection<TestPositionDocument>> {
  const db = await getMongoDb();
  const collection = db.collection<TestPositionDocument>(COLLECTION_NAME);

  if (!indexesPromise) {
    indexesPromise = collection
      .createIndexes([
        { name: "opportunity-created-at", key: { opportunityId: 1, createdAt: -1 } },
        { name: "status-updated-at", key: { status: 1, updatedAt: -1 } },
        { name: "created-at-desc", key: { createdAt: -1 } },
      ])
      .then(() => undefined);
  }

  await indexesPromise;
  return collection;
}

export async function insertTestPosition(
  document: TestPositionDocument,
): Promise<TestPositionDocument> {
  const collection = await getCollection();
  const result = await collection.insertOne(document);
  return { ...document, _id: result.insertedId };
}

export async function findTestPositionById(
  id: ObjectId,
): Promise<TestPositionDocument | null> {
  const collection = await getCollection();
  return collection.findOne({ _id: id });
}

export async function listTestPositions(
  limit = 100,
): Promise<TestPositionDocument[]> {
  const collection = await getCollection();
  return collection
    .find({})
    .sort({ createdAt: -1 })
    .limit(Math.max(1, Math.min(limit, 200)))
    .toArray();
}

export async function listOpenTestPositions(): Promise<TestPositionDocument[]> {
  const collection = await getCollection();
  return collection.find({ status: "OPEN" }).sort({ createdAt: 1 }).toArray();
}

export async function updateOpenMonitoring(
  id: ObjectId,
  currentBitpinPrice: number | null,
  checkedAt: Date,
  lastError: string | null,
): Promise<boolean> {
  const collection = await getCollection();
  const result = await collection.updateOne(
    { _id: id, status: "OPEN" },
    {
      $set: {
        "monitoring.currentBitpinPrice": currentBitpinPrice,
        "monitoring.lastCheckedAt": checkedAt,
        "monitoring.lastError": lastError,
        updatedAt: checkedAt,
      },
    },
  );
  return result.modifiedCount === 1;
}

export async function recordOpenMonitoringFailure(
  id: ObjectId,
  checkedAt: Date,
  errorMessage: string,
): Promise<boolean> {
  const collection = await getCollection();
  const result = await collection.updateOne(
    { _id: id, status: "OPEN" },
    {
      $set: {
        "monitoring.lastCheckedAt": checkedAt,
        "monitoring.lastError": errorMessage,
        updatedAt: checkedAt,
      },
    },
  );
  return result.modifiedCount === 1;
}

export async function closeOpenTestPosition(
  id: ObjectId,
  exitPrice: number,
  result: TestPositionDocument["result"],
  exitReason: TestPositionDocument["exitReason"],
  grossPnl: number,
  exitFee: number,
  totalFees: number,
  netPnl: number,
  closedAt: Date,
): Promise<boolean> {
  const collection = await getCollection();

  const update = await collection.updateOne(
    { _id: id, status: "OPEN" },
    {
      $set: {
        status: result === "LIQUIDATED" ? "LIQUIDATED" : "CLOSED",
        result,
        exitPrice,
        exitReason,
        closedAt,
        grossPnl,
        exitFee,
        totalFees,
        netPnl,
        "monitoring.currentBitpinPrice": exitPrice,
        "monitoring.lastCheckedAt": closedAt,
        "monitoring.lastError": null,
        updatedAt: closedAt,
      },
    },
  );

  return update.modifiedCount === 1;
}
