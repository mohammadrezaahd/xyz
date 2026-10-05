"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseCandles = parseCandles;
exports.dedupeSort = dedupeSort;
function asNumber(value) {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? n : undefined;
}
function normalizeRow(row) {
    const rawTime = row.time ??
        row.timestamp ??
        row.startTime ??
        row.start_time ??
        row.ts ??
        row.t;
    const timeValue = asNumber(rawTime);
    const time = typeof rawTime === "string" && Number.isNaN(Number(rawTime))
        ? Date.parse(rawTime) / 1000
        : timeValue;
    const open = asNumber(row.open ?? row.o);
    const high = asNumber(row.high ?? row.h);
    const low = asNumber(row.low ?? row.l);
    const close = asNumber(row.close ?? row.c);
    const volume = asNumber(row.volume ?? row.v);
    if (!time || open === undefined || high === undefined || low === undefined || close === undefined) {
        return null;
    }
    return {
        time: time > 2000000000 ? Math.floor(time / 1000) : Math.floor(time),
        open,
        high,
        low,
        close,
        volume,
    };
}
function parseCandles(payload) {
    if (Array.isArray(payload)) {
        return payload
            .map((item) => Array.isArray(item)
            ? normalizeRow({ t: item[0], o: item[1], h: item[2], l: item[3], c: item[4], v: item[5] })
            : typeof item === "object" && item !== null
                ? normalizeRow(item)
                : null)
            .filter((x) => x !== null);
    }
    if (typeof payload !== "object" || payload === null)
        return [];
    const obj = payload;
    if (Array.isArray(obj.results))
        return parseCandles(obj.results);
    if (Array.isArray(obj.data))
        return parseCandles(obj.data);
    if (Array.isArray(obj.t) &&
        Array.isArray(obj.o) &&
        Array.isArray(obj.h) &&
        Array.isArray(obj.l) &&
        Array.isArray(obj.c)) {
        return obj.t
            .map((t, i) => normalizeRow({
            t,
            o: obj.o[i],
            h: obj.h[i],
            l: obj.l[i],
            c: obj.c[i],
            v: Array.isArray(obj.v) ? obj.v[i] : undefined,
        }))
            .filter((x) => x !== null);
    }
    return [];
}
function dedupeSort(candles) {
    const map = new Map();
    for (const candle of candles)
        map.set(candle.time, candle);
    return [...map.values()].sort((a, b) => a.time - b.time);
}
