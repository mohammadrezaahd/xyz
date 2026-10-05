"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMongoDb = getMongoDb;
exports.closeMongoClient = closeMongoClient;
function requireMongoEnv() {
    const uri = process.env.MONGODB_URI?.trim();
    const dbName = process.env.MONGODB_DB_NAME?.trim();
    if (!uri)
        throw new Error("Missing required environment variable: MONGODB_URI");
    if (!dbName)
        throw new Error("Missing required environment variable: MONGODB_DB_NAME");
    return { uri, dbName };
}
async function getMongoDb() {
    const { MongoClient } = await Promise.resolve().then(() => __importStar(require("mongodb")));
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
async function closeMongoClient() {
    if (globalThis.__xyzMongoClient) {
        await globalThis.__xyzMongoClient.close();
    }
    globalThis.__xyzMongoClient = undefined;
    globalThis.__xyzMongoClientPromise = undefined;
}
