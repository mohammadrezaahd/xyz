export type Candle = { time:number; open:number; high:number; low:number; close:number; volume?:number };
function asNumber(value: unknown): number | undefined { const n = typeof value === "number" ? value : Number(value); return Number.isFinite(n) ? n : undefined; }
function normalizeRow(row: Record<string, unknown>): Candle | null {
  const rawTime = row.time ?? row.timestamp ?? row.startTime ?? row.start_time ?? row.t;
  const timeValue = asNumber(rawTime);
  const time = typeof rawTime === "string" && Number.isNaN(Number(rawTime)) ? Date.parse(rawTime) / 1000 : timeValue;
  const open = asNumber(row.open ?? row.o), high = asNumber(row.high ?? row.h), low = asNumber(row.low ?? row.l), close = asNumber(row.close ?? row.c), volume = asNumber(row.volume ?? row.v);
  if (!time || open === undefined || high === undefined || low === undefined || close === undefined) return null;
  return { time: time > 2_000_000_000 ? Math.floor(time / 1000) : Math.floor(time), open, high, low, close, volume };
}
export function parseCandles(payload: unknown): Candle[] {
  if (Array.isArray(payload)) return payload.map((item) => Array.isArray(item) ? normalizeRow({t:item[0],o:item[1],h:item[2],l:item[3],c:item[4],v:item[5]}) : typeof item === "object" && item !== null ? normalizeRow(item as Record<string,unknown>) : null).filter((x): x is Candle => x !== null);
  if (typeof payload !== "object" || payload === null) return [];
  const obj = payload as Record<string,unknown>;
  if (Array.isArray(obj.results)) return parseCandles(obj.results);
  if (Array.isArray(obj.data)) return parseCandles(obj.data);
  if (Array.isArray(obj.t) && Array.isArray(obj.o) && Array.isArray(obj.h) && Array.isArray(obj.l) && Array.isArray(obj.c)) return (obj.t as unknown[]).map((t,i) => normalizeRow({t,o:(obj.o as unknown[])[i],h:(obj.h as unknown[])[i],l:(obj.l as unknown[])[i],c:(obj.c as unknown[])[i],v:Array.isArray(obj.v)?(obj.v as unknown[])[i]:undefined})).filter((x): x is Candle => x !== null);
  return [];
}
export function dedupeSort(candles:Candle[]):Candle[] { const map=new Map<number,Candle>(); for(const candle of candles) map.set(candle.time,candle); return [...map.values()].sort((a,b)=>a.time-b.time); }