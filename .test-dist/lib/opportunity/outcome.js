"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateSyntheticOutcome = evaluateSyntheticOutcome;
exports.calculateOpportunityStats = calculateOpportunityStats;
function isValidStoredPrice(value) {
    return Number.isFinite(value) && value > 0;
}
function evaluateSyntheticOutcome(entryPrice, targetPrice, currentPrice, direction) {
    if (!isValidStoredPrice(entryPrice)) {
        return {
            status: "INVALIDATED",
            exitPrice: null,
            priceChangePct: null,
            reason: "Stored entry price is structurally invalid.",
        };
    }
    if (!isValidStoredPrice(targetPrice)) {
        return {
            status: "INVALIDATED",
            exitPrice: null,
            priceChangePct: null,
            reason: "Stored target price is structurally invalid.",
        };
    }
    if (typeof currentPrice !== "number" ||
        !Number.isFinite(currentPrice) ||
        currentPrice <= 0) {
        return {
            status: "OPEN",
            exitPrice: null,
            priceChangePct: null,
            reason: "Current Bitpin price is unavailable or invalid.",
        };
    }
    if (direction === "SHORT") {
        if (currentPrice >= targetPrice) {
            return {
                status: "SUCCESS",
                exitPrice: currentPrice,
                priceChangePct: ((currentPrice - entryPrice) / entryPrice) * 100,
            };
        }
        if (currentPrice < entryPrice) {
            return {
                status: "FAILED",
                exitPrice: currentPrice,
                priceChangePct: ((currentPrice - entryPrice) / entryPrice) * 100,
            };
        }
        return {
            status: "OPEN",
            exitPrice: null,
            priceChangePct: null,
        };
    }
    return {
        status: "INVALIDATED",
        exitPrice: null,
        priceChangePct: null,
        reason: "Unsupported position direction.",
    };
}
function calculateOpportunityStats(statuses) {
    const total = statuses.length;
    const open = statuses.filter((status) => status === "OPEN").length;
    const successful = statuses.filter((status) => status === "SUCCESS").length;
    const failed = statuses.filter((status) => status === "FAILED").length;
    const invalidated = statuses.filter((status) => status === "INVALIDATED").length;
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
