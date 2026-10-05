"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isCronAuthorized = isCronAuthorized;
function isCronAuthorized(authorizationHeader, cronSecret) {
    const secret = cronSecret?.trim();
    return Boolean(secret) && authorizationHeader === `Bearer ${secret}`;
}
