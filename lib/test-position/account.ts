import type { Collection } from "mongodb";
import { getMongoDb } from "../mongodb";
import {
  TEST_ACCOUNT_ID,
  TEST_POSITION_INITIAL_CAPITAL,
  type TestAccountDocument,
} from "./types";

const COLLECTION_NAME = "testAccount";
let collectionPromise: Promise<Collection<TestAccountDocument>> | undefined;

async function getCollection(): Promise<Collection<TestAccountDocument>> {
  if (!collectionPromise) {
    collectionPromise = getMongoDb().then((db) =>
      db.collection<TestAccountDocument>(COLLECTION_NAME),
    );
  }
  return collectionPromise;
}

export async function getOrCreateTestAccount(
  now = new Date(),
): Promise<TestAccountDocument> {
  const collection = await getCollection();
  const result = await collection.findOneAndUpdate(
    { _id: TEST_ACCOUNT_ID },
    {
      $setOnInsert: {
        _id: TEST_ACCOUNT_ID,
        initialCapital: TEST_POSITION_INITIAL_CAPITAL,
        availableCapital: TEST_POSITION_INITIAL_CAPITAL,
        equity: TEST_POSITION_INITIAL_CAPITAL,
        updatedAt: now,
      },
    },
    { upsert: true, returnDocument: "after" },
  );

  if (!result) throw new Error("Unable to initialize test account");
  return result;
}

export async function reserveTestMargin(
  margin: number,
  now = new Date(),
): Promise<boolean> {
  const collection = await getCollection();
  const result = await collection.updateOne(
    { _id: TEST_ACCOUNT_ID, availableCapital: { $gte: margin } },
    {
      $inc: { availableCapital: -margin },
      $set: { updatedAt: now },
    },
  );
  return result.modifiedCount === 1;
}

export async function releaseTestMargin(
  finalEquity: number,
  now = new Date(),
): Promise<boolean> {
  const collection = await getCollection();
  const result = await collection.updateOne(
    { _id: TEST_ACCOUNT_ID },
    {
      $inc: { availableCapital: finalEquity },
      $set: { updatedAt: now },
    },
  );
  return result.modifiedCount === 1;
}

export async function refundTestMargin(
  margin: number,
  now = new Date(),
): Promise<boolean> {
  const collection = await getCollection();
  const result = await collection.updateOne(
    { _id: TEST_ACCOUNT_ID },
    {
      $inc: { availableCapital: margin },
      $set: { updatedAt: now },
    },
  );
  return result.modifiedCount === 1;
}

export async function setTestAccountEquity(
  equity: number,
  now = new Date(),
): Promise<boolean> {
  const collection = await getCollection();
  const result = await collection.updateOne(
    { _id: TEST_ACCOUNT_ID },
    { $set: { equity, updatedAt: now } },
  );
  return result.modifiedCount === 1;
}
