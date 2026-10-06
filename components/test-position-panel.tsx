"use client";

import { useEffect, useMemo, useState } from "react";

type Opportunity={_id?:string|{$oid?:string};status:string;direction:"SHORT";opportunityStrength:string;entry:{price:number};target?:{price:number};analysis:{score:number};riskLevel?:string};
type Position={
  _id?:string; opportunityId:string|null; status:"OPEN"|"CLOSED"|"LIQUIDATED"; result:"PREDICT_SUCCESS"|"RELATIVELY_SUCCESSFUL"|"FAILED"|"LIQUIDATED"|null; direction:"SHORT";
  initialCapital:number;margin:number;leverage:5|10|20;leveragedCredit:number;positionNotional:number;usdtQuantity:number;
  entryPrice:number;targetPrice:number;liquidationPrice:number;entryFeePct:number;exitFeePct:number;entryFee:number;exitFee:number|null;totalFees:number;
  grossPnl:number;netPnl:number;currentPrice:number|null;currentEquity:number;exitPrice:number|null;entryAt:string;closedAt:string|null;exitReason:string|null;
  opportunitySnapshot:{opportunityStrength:string;score:number;suggestedTargetPrice:number;riskLevel:string}|null;
  monitoring:{lastCheckedAt:string|null;lastError:string|null};
};

const LEVERAGES=[5,10,20] as const;
function money(v:number|null){return v===null?"—":v.toLocaleString("en-US",{maximumFractionDigits:2});}
function date(v:string|null){return v?new Date(v).toLocaleString():"—";}
function duration(a:string,b:string|null){if(!b)return"Open";const m=Math.max(0,Math.floor((new Date(b).getTime()-new Date(a).getTime())/60000));return m<60?m+"m":Math.floor(m/60)+"h "+m%60+"m";}

export function TestPositionPanel({refreshKey,currentPrice}:{refreshKey:number;currentPrice:number|null}){
  const [open,setOpen]=useState<Position[]>([]),[history,setHistory]=useState<Position[]>([]),[opportunity,setOpportunity]=useState<Opportunity|null>(null);
  const [capital,setCapital]=useState(1000000),[leverage,setLeverage]=useState<5|10|20>(20),[target,setTarget]=useState(""),[useOpportunity,setUseOpportunity]=useState(true),[error,setError]=useState(""),[busy,setBusy]=useState(false);

  async function load(){
    try{
      const [p,o]=await Promise.all([
        fetch("/api/test-positions",{cache:"no-store"}),
        fetch("/api/opportunities",{cache:"no-store"}),
      ]);
      const pd=await p.json() as {open?:Position[];history?:Position[];error?:string};
      const od=await o.json() as {open?:Opportunity|null};
      if(!p.ok)throw new Error(pd.error??"Unable to load positions");
      setOpen(pd.open??[]);setHistory(pd.history??[]);setOpportunity(od.open??null);setError("");
    }catch(e){setError(e instanceof Error?e.message:"Unable to load Phase 4");}
  }
  useEffect(()=>{void load();const t=window.setInterval(()=>void load(),15000);return()=>window.clearInterval(t);},[refreshKey]);

  useEffect(()=>{
    if(!target&&opportunity?.target?.price) setTarget(String(opportunity.target.price));
    else if(!target&&currentPrice) setTarget(String(Math.max(1,currentPrice*0.995)));
  },[opportunity,currentPrice,target]);

  const exposure=capital*(leverage+1);
  const quantity=currentPrice&&currentPrice>0?exposure/currentPrice:null;
  const liquidation=currentPrice&&currentPrice>0?currentPrice*(1+1/(leverage+1)):null;

  async function start(){
    setBusy(true);setError("");
    try{
      const targetPrice=Number(target);
      const opportunityId=useOpportunity&&opportunity?String(opportunity._id&&typeof opportunity._id==="object"?opportunity._id.$oid:opportunity._id):null;
      const r=await fetch("/api/test-positions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({initialCapital:capital,leverage,targetPrice,opportunityId})});
      const d=await r.json() as {error?:string};
      if(!r.ok)throw new Error(d.error??"Unable to start test");
      await load();
    }catch(e){setError(e instanceof Error?e.message:"Unable to start test");}finally{setBusy(false);}
  }

  async function close(id:string){try{const r=await fetch("/api/test-positions/"+id+"/close",{method:"POST"});const d=await r.json() as {error?:string};if(!r.ok)throw new Error(d.error??"Unable to close");await load();}catch(e){setError(e instanceof Error?e.message:"Unable to close");}}
  async function editTarget(id:string,value:number){try{const r=await fetch("/api/test-positions/"+id+"/target",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({targetPrice:value})});const d=await r.json() as {error?:string};if(!r.ok)throw new Error(d.error??"Unable to update target");await load();}catch(e){setError(e instanceof Error?e.message:"Unable to update target");}}

  return <section className="phase4 card">
    <div className="opportunityHeader"><div><div className="exchange">Paper Trading Simulator</div><div className="symbol">Training mode · live Bitpin market data · no real trading</div></div></div>

    <div className="phase4StartRow">
      <label className="phase4Input"><span>Capital</span><input type="number" min="1" step="1" value={capital} onChange={e=>setCapital(Number(e.target.value))}/></label>
      <label className="phase4Input"><span>Leverage</span><select value={leverage} onChange={e=>setLeverage(Number(e.target.value) as 5|10|20)}>{LEVERAGES.map(v=><option key={v} value={v}>{v}x</option>)}</select></label>
      <div className="phase4Input"><span>Current Bitpin Price</span><strong>{money(currentPrice)}</strong></div>
      <div className="phase4Input"><span>USDT Quantity</span><strong>{quantity===null?"—":quantity.toFixed(6)}</strong></div>
      <div className="phase4Input"><span>Position Exposure</span><strong>{money(exposure)}</strong></div>
      <label className="phase4Input"><span>Sell / Target Price</span><input type="number" min="0.000001" step="0.01" value={target} onChange={e=>setTarget(e.target.value)}/></label>
      <div className="phase4Input"><span>Estimated Liquidation</span><strong>{money(liquidation)}</strong></div>
      <button className="phase4StartButton" type="button" disabled={busy||!Number.isFinite(capital)||capital<=0||!Number.isFinite(Number(target))||Number(target)<=0} onClick={()=>void start()}>{busy?"Starting…":"Start Test"}</button>
    </div>

    {opportunity&&<div className="phase4AccountNotice">
      <strong>Opportunity Suggestion</strong>
      <span>{opportunity.opportunityStrength} · Score {opportunity.analysis.score} · Suggested Entry {money(opportunity.entry.price)} · Suggested Target {money(opportunity.target?.price??null)}</span>
      <label><input type="checkbox" checked={useOpportunity} onChange={e=>setUseOpportunity(e.target.checked)}/> Attach this Opportunity as historical context</label>
    </div>}

    <div className="phase4Current"><h3>Open Positions</h3>{open.length?open.map(p=><article className="phase4PositionCard" key={p._id}>
      <div className="phase4PositionHead"><div><span className="phase4Badge open">OPEN</span> <strong>{p.direction}</strong></div><button type="button" onClick={()=>p._id&&void close(p._id)}>Close Position</button></div>
      <div className="phase4Grid">
        <div><span>Entry · Bitpin</span><strong>{money(p.entryPrice)}</strong></div><div><span>Current</span><strong>{money(p.currentPrice)}</strong></div>
        <div><span>Target</span><input type="number" value={p.targetPrice} onChange={e=>{const v=Number(e.target.value);if(Number.isFinite(v)&&v>0&&p._id)void editTarget(p._id,v)}}/></div>
        <div><span>Liquidation</span><strong>{money(p.liquidationPrice)}</strong></div>
        <div><span>User Capital</span><strong>{money(p.initialCapital)}</strong></div><div><span>Leverage</span><strong>{p.leverage}x</strong></div>
        <div><span>Leveraged Credit</span><strong>{money(p.leveragedCredit)}</strong></div><div><span>Position Exposure</span><strong>{money(p.positionNotional)}</strong></div>
        <div><span>USDT Quantity</span><strong>{p.usdtQuantity.toFixed(6)}</strong></div><div><span>Gross PnL</span><strong>{money(p.grossPnl)}</strong></div>
        <div><span>Estimated Exit Fee</span><strong>{money(p.totalFees-p.entryFee)}</strong></div><div><span>Current Net PnL</span><strong>{money(p.netPnl)}</strong></div>
        <div><span>Current Equity</span><strong>{money(p.currentEquity)}</strong></div><div><span>Entry Fee</span><strong>{money(p.entryFee)}</strong></div>
        <div><span>Open Time</span><strong>{date(p.entryAt)}</strong></div><div><span>Last Monitoring</span><strong>{date(p.monitoring.lastCheckedAt)}</strong></div>
      </div>
      {p.monitoring.lastError&&<div className="phase4Warning">Monitoring retry pending: {p.monitoring.lastError}</div>}
    </article>):<div className="phase3Empty">No OPEN paper positions.</div>}</div>

    <div className="phase4History"><h3>Position History</h3>{history.length?<div className="phase3TableWrap"><table className="phase3Table"><thead><tr><th>Result</th><th>Entry</th><th>Exit</th><th>Target</th><th>Liquidation</th><th>Capital</th><th>Leverage</th><th>Exposure</th><th>USDT</th><th>Gross PnL</th><th>Entry Fee</th><th>Exit Fee</th><th>Total Fees</th><th>Net PnL</th><th>Final Equity</th><th>Reason</th><th>Duration</th></tr></thead><tbody>{history.map(p=><tr key={p._id}><td>{p.result??"—"}</td><td>{money(p.entryPrice)}</td><td>{money(p.exitPrice)}</td><td>{money(p.targetPrice)}</td><td>{money(p.liquidationPrice)}</td><td>{money(p.initialCapital)}</td><td>{p.leverage}x</td><td>{money(p.positionNotional)}</td><td>{p.usdtQuantity.toFixed(6)}</td><td>{money(p.grossPnl)}</td><td>{money(p.entryFee)}</td><td>{money(p.exitFee)}</td><td>{money(p.totalFees)}</td><td>{money(p.netPnl)}</td><td>{money(p.currentEquity)}</td><td>{p.exitReason??"—"}</td><td>{duration(p.entryAt,p.closedAt)}</td></tr>)}</tbody></table></div>:<div className="phase3Empty">No historical paper positions yet.</div>}</div>
    {error&&<div className="error">{error}</div>}
  </section>;
}
