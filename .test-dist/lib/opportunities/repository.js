"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findOpenOpportunity = findOpenOpportunity;
exports.insertOpenOpportunity = insertOpenOpportunity;
exports.updateOpenMonitoring = updateOpenMonitoring;
exports.resolveOpportunity = resolveOpportunity;
exports.invalidateOpportunity = invalidateOpportunity;
exports.listRecentOpportunities = listRecentOpportunities;
exports.getOpportunityStats = getOpportunityStats;
const mongodb_1 = require("mongodb");
const mongodb_2 = require("../mongodb");
const COLLECTION_NAME = "opportunities";
let indexesPromise;
async function getCollection() {
    const db = await (0, mongodb_2.getMongoDb)();
    const collection = db.collection(COLLECTION_NAME);
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
async function findOpenOpportunity() {
    const collection = await getCollection();
    return collection.findOne({ status: "OPEN" }, { sort: { createdAt: -1 } });
}
async function insertOpenOpportunity(document) {
    const collection = await getCollection();
    try {
        const result = await collection.insertOne(document);
        return { ...document, _id: result.insertedId };
    }
    catch (error) {
        if (error instanceof mongodb_1.MongoServerError && error.code === 11000) {
            const existing = await findOpenOpportunity();
            if (existing)
                return existing;
        }
        throw error;
    }
}
async function updateOpenMonitoring(id, currentBitpinPrice, updatedAt) {
    const collection = await getCollection();
    const result = await collection.updateOne({ _id: id, status: "OPEN" }, {
        $set: {
            "monitoring.currentBitpinPrice": currentBitpinPrice,
            "monitoring.updatedAt": updatedAt,
            updatedAt,
        },
    });
    return result.modifiedCount === 1;
}
async function resolveOpportunity(id, exitPrice, priceChangePct, resolvedAt, status) {
    const collection = await getCollection();
    const result = await collection.updateOne({ _id: id, status: "OPEN" }, {
        $set: {
            status,
            updatedAt: resolvedAt,
            "outcome.status": status,
            "outcome.resolvedAt": resolvedAt,
            "outcome.exitPrice": exitPrice,
            "outcome.priceChangePct": priceChangePct,
        },
    });
    return result.modifiedCount === 1;
}
async function invalidateOpportunity(id, resolvedAt) {
    const collection = await getCollection();
    const result = await collection.updateOne({ _id: id, status: "OPEN" }, {
        $set: {
            status: "INVALIDATED",
            updatedAt: resolvedAt,
            "outcome.status": "INVALIDATED",
            "outcome.resolvedAt": resolvedAt,
        },
    });
    return result.modifiedCount === 1;
}
async function listRecentOpportunities(limit = 20) {
    const collection = await getCollection();
    return collection
        .find({})
        .sort({ createdAt: -1 })
        .limit(Math.max(1, Math.min(limit, 100)))
        .toArray();
}
async function getOpportunityStats() {
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
        resolved,
        successRate: resolved > 0 ? successful / resolved : null,
    };
}
