import type { Candle } from "../candles";

const horizons = [15, 30, 60, 120] as const;
type Dir = "UP" | "DOWN" | "FLAT";
const ok = (n: number) => Number.isFinite(n) && n > 0;
const pct = (a: number, b: number) => (a / b - 1) * 100;
const dir = (n: number, t: number): Dir => n > t ? "UP" : n < -t ? "DOWN" : "FLAT";
function local(t: number) {
  const p = new Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Tehran",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(t*1000));
  const v = Object.fromEntries(p.map(x=>[x.type,x.value]));
  return {date:`${v.year}-${v.month}-${v.day}`,m:Number(v.hour)*60+Number(v.minute)};
}
function med(a:number[]) { a=a.filter(Number.isFinite).sort((x,y)=>x-y); if(!a.length)return null; const m=Math.floor(a.length/2); return a.length%2?a[m]:(a[m-1]+a[m])/2; }

export function runOpeningBacktest(input:Candle[], costPct=0.2) {
  if(!Number.isFinite(costPct)||costPct<0) throw new Error("Cost must be finite and non-negative");
  const days=new Map<string,Candle[]>();
  // Filter only the research copy. The chart keeps the complete original history.
  for(const c of input.filter(x=>ok(x.close)&&(x.volume===undefined||(Number.isFinite(x.volume)&&x.volume>0))).sort((a,b)=>a.time-b.time)){
    const p=local(c.time); if(p.m<540||p.m>1270)continue;
    const a=days.get(p.date)||[]; a.push(c); days.set(p.date,a);
  }
  const dates=[...days.keys()].sort();
  const sessions=dates.map((date,i)=>{
    const rows=days.get(date)!;
    const open=rows.find(c=>{const m=local(c.time).m;return m>=540&&m<=555;});
    if(!open)return null;
    const prev=i?days.get(dates[i-1])||[]:[];
    const first=prev[0],last=prev[prev.length-1];
    const gap=last?pct(open.close,last.close):null;
    const trend=first&&last?pct(last.close,first.open):null;
    const hs=prev.map(c=>c.high).filter(ok),ls=prev.map(c=>c.low).filter(ok);
    const vol=last&&hs.length&&ls.length?(Math.max(...hs)-Math.min(...ls))/last.close*100:null;
    const base=med(prev.map(c=>c.volume??0).filter(x=>x>0));
    const vr=base&&open.volume!==undefined?open.volume/base:null;
    const volumeRegime=vr===null?"UNKNOWN":vr<0.75?"LOW":vr<1.5?"NORMAL":"HIGH";
    const trendRegime=trend===null?"UNKNOWN":trend>0.15?"BULLISH":trend< -0.15?"BEARISH":"FLAT";
    const volatilityRegime=vol===null?"UNKNOWN":vol<1?"LOW":vol<2?"NORMAL":"HIGH";
    return {date,rows,open,gap,trend,vol,vr,volumeRegime,trendRegime,volatilityRegime};
  }).filter((s):s is NonNullable<typeof s>=>s!==null);
  const samples:Array<{date:string;time:number;horizon:number;gapPct:number|null;volumeRatio:number|null;volumeRegime:string;trendRegime:string;volatilityRegime:string;signal:Dir;baseline:Dir;actualPct:number;netPct:number;split:"TRAIN"|"TUNE"|"TEST"}>=[];
  for(const s of sessions){
    const gap=s.gap===null?"FLAT":dir(s.gap,0.05), trend=s.trend===null?"FLAT":dir(s.trend,0.15);
    const signal:Dir=s.volumeRegime!=="LOW"&&gap!=="FLAT"?gap:s.volumeRegime==="HIGH"&&trend!=="FLAT"?trend:"FLAT";
    const ix=s.rows.findIndex(c=>c.time===s.open.time);
    for(const h of horizons){const future=s.rows.slice(ix+1).find(c=>c.time>=s.open.time+h*60&&c.time<=s.open.time+h*60+120&&ok(c.close));if(!future)continue;
      const actualPct=pct(future.close,s.open.close), gross=signal==="FLAT"?0:signal==="UP"?actualPct:-actualPct;
      samples.push({date:s.date,time:s.open.time,horizon:h,gapPct:s.gap,volumeRatio:s.vr,volumeRegime:s.volumeRegime,trendRegime:s.trendRegime,volatilityRegime:s.volatilityRegime,signal,baseline:trend,actualPct,netPct:signal==="FLAT"?0:gross-costPct,split:"TRAIN"});
    }
  }
  for(const h of horizons){const a=samples.filter(s=>s.horizon===h).sort((x,y)=>x.time-y.time),tr=Math.floor(a.length*.6),tu=Math.floor(a.length*.8);a.forEach((s,i)=>s.split=i<tr?"TRAIN":i<tu?"TUNE":"TEST");}
  const mean=(a:number[])=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
  const metrics=horizons.map(h=>{const all=samples.filter(s=>s.horizon===h),test=all.filter(s=>s.split==="TEST"),tr=test.filter(s=>s.signal!=="FLAT"),base=test.filter(s=>s.baseline!=="FLAT");
    return {horizonMinutes:h,samples:all.length,trainSamples:all.filter(s=>s.split==="TRAIN").length,tuneSamples:all.filter(s=>s.split==="TUNE").length,testSamples:test.length,status:test.length<10?"INSUFFICIENT_SAMPLE":"EVALUATED",trades:tr.length,winRate:tr.length?tr.filter(s=>s.netPct>0).length/tr.length:null,meanNetReturnPct:mean(tr.map(s=>s.netPct)),baselineTrades:base.length,baselineMeanNetReturnPct:mean(base.map(s=>(s.baseline==="UP"?s.actualPct:-s.actualPct)-costPct)),costPerRoundTripPct:costPct};});
  const groups=(["volumeRegime","trendRegime","volatilityRegime"] as const).map(k=>({dimension:k,groups:[...new Set(sessions.map(s=>s[k]))].map(label=>{const ds=sessions.filter(s=>s[k]===label).map(s=>s.date),a=samples.filter(s=>s.horizon===30&&ds.includes(s.date));return {label,sessions:ds.length,outcomes30m:a.length,meanReturn30mPct:mean(a.map(s=>s.actualPct)),upRate30m:a.length?a.filter(s=>s.actualPct>0).length/a.length:null};})}));
  return {method:"opening-event-study-v1",timezone:"Asia/Tehran",assumptions:{costPerRoundTripPct:costPct,entry:"opening candle close",outcome:"first positive-volume close at/after horizon within 2 minutes",futureDataUsedForPrediction:false},summary:{sessions:sessions.length,outcomes:samples.length,testSessions:new Set(samples.filter(s=>s.split==="TEST").map(s=>s.date)).size},metrics,groups,sessions:sessions.map(s=>({date:s.date,openingTime:s.open.time,openingPrice:s.open.close,openingVolume:s.open.volume??null,gapPct:s.gap,priorTrendPct:s.trend,priorVolatilityPct:s.vol,openingVolumeRatio:s.vr,volumeRegime:s.volumeRegime,trendRegime:s.trendRegime,volatilityRegime:s.volatilityRegime})),samples};
}
