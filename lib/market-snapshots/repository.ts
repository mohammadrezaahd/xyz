import { ObjectId, type Collection, type Filter } from "mongodb";
import { getMongoDb } from "../mongodb";
import type { MarketSnapshot, MarketSnapshotTrend } from "./types";

const COLLECTION_NAME = "marketSnapshots";
let indexesPromise: Promise<void> | undefined;

async function getCollection(): Promise<Collection<MarketSnapshot>> {
  const collection = (await getMongoDb()).collection<MarketSnapshot>(COLLECTION_NAME);
  if (!indexesPromise) {
    indexesPromise = collection.createIndexes([
      { name: "created-at-desc", key: { createdAt: -1 } },
      { name: "trend-created-at", key: { trend: 1, createdAt: -1 } },
    ]).then(() => undefined);
  }
  await indexesPromise;
  return collection;
}

export async function createMarketSnapshot(snapshot: MarketSnapshot): Promise<MarketSnapshot> {
  const result = await (await getCollection()).insertOne(snapshot);
  return { ...snapshot, _id: result.insertedId };
}

export async function listMarketSnapshots(limit = 50, trend?: MarketSnapshotTrend): Promise<MarketSnapshot[]> {
  const filter: Filter<MarketSnapshot> = trend ? { trend } : {};
  return (await getCollection())
    .find(filter)
    .sort({ createdAt: -1 })
    .limit(Math.max(1, Math.min(limit, 100)))
    .toArray();
}

export async function findMarketSnapshotById(id: ObjectId): Promise<MarketSnapshot | null> {
  return (await getCollection()).findOne({ _id: id });
}
