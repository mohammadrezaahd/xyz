import type { MongoClient } from "mongodb";

declare global {
  var __xyzMongoClient: MongoClient | undefined;
  var __xyzMongoClientPromise: Promise<MongoClient> | undefined;
}

function requireMongoEnv(): { uri: string; dbName: string } {
  const uri = process.env.MONGODB_URI?.trim();
  const dbName = process.env.MONGODB_DB_NAME?.trim();

  if (!uri) throw new Error("Missing required environment variable: MONGODB_URI");
  if (!dbName) throw new Error("Missing required environment variable: MONGODB_DB_NAME");

  return { uri, dbName };
}

export async function getMongoDb() {
  const { MongoClient } = await import("mongodb");
  const { uri, dbName } = requireMongoEnv();

  if (!globalThis.__xyzMongoClient) {
    globalThis.__xyzMongoClient = new MongoClient(uri);
  }

  if (!globalThis.__xyzMongoClientPromise) {
    globalThis.__xyzMongoClientPromise = globalThis.__xyzMongoClient.connect();
  }

  const client = await globalThis.__xyzMongoClientPromise;
  return client.db(dbName);
}

export async function closeMongoClient(): Promise<void> {
  if (globalThis.__xyzMongoClient) {
    await globalThis.__xyzMongoClient.close();
  }

  globalThis.__xyzMongoClient = undefined;
  globalThis.__xyzMongoClientPromise = undefined;
}
