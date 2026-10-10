"use client";

import { useMemo, useState } from "react";

type Side = "LONG" | "SHORT";
type Trade = { id: number; side: Side; entry: string; exit: string; leverage: string };
type TradeResult = Trade & { margin: number; notional: number; gross: number; fees: number; net: number; endingEquity: number; returnPct: number };

const initialTrade = (id: number): Trade => ({ id, side: "LONG", entry: "", exit: "", leverage: "10" });
const numeric = (value: string) => {
  const parsed = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};
const money = (value: number, digits = 2) => value.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 });

export function TradingCalculator() {
  const [initialCapital, setInitialCapital] = useState("1000000");
  const [conversionRate, setConversionRate] = useState("270000");
  const [entryFeePct, setEntryFeePct] = useState("0.35");
  const [exitFeePct, setExitFeePct] = useState("0.35");
  const [trades, setTrades] = useState<Trade[]>([initialTrade(1)]);
  const rate = numeric(conversionRate);
  const capital = numeric(initialCapital);

  const results = useMemo(() => {
    let equity = capital;
    const calculated: TradeResult[] = trades.map((trade) => {
      const entry = numeric(trade.entry);
      const exit = numeric(trade.exit);
      const leverage = numeric(trade.leverage);
      const margin = Math.max(0, equity);
      const notional = margin * (1 + leverage);
      const returnPct = entry > 0 && exit > 0 ? (trade.side === "LONG" ? (exit - entry) : (entry - exit)) / entry * 100 : 0;
      const gross = entry > 0 && exit > 0 ? notional * returnPct / 100 : 0;
      const exitNotional = entry > 0 && exit > 0 ? notional * exit / entry : 0;
      const fees = entry > 0 && exit > 0 ? notional * numeric(entryFeePct) / 100 + exitNotional * numeric(exitFeePct) / 100 : 0;
      const net = gross - fees;
      equity += net;
      return { ...trade, margin, notional, gross, fees, net, endingEquity: equity, returnPct };
    });
    return { trades: calculated, finalEquity: equity, totalProfit: equity - capital };
  }, [capital, trades, entryFeePct, exitFeePct]);

  const updateTrade = (id: number, patch: Partial<Trade>) => setTrades((current) => current.map((trade) => trade.id === id ? { ...trade, ...patch } : trade));
  const addTrade = () => setTrades((current) => [...current, initialTrade(Math.max(0, ...current.map((trade) => trade.id)) + 1)]);
  const removeTrade = (id: number) => setTrades((current) => current.length > 1 ? current.filter((trade) => trade.id !== id) : current);

  return <section className="workspacePage calculatorWorkspace">
    <div className="pageIntro"><div className="sectionEyebrow">POSITION & PNL LAB</div><h2>Leveraged Trading Calculator</h2><p>Simulate sequential LONG and SHORT trades with shared equity. No exchange orders are sent.</p></div>
    <div className="calculatorSettings">
      <label>Initial capital · Toman<input inputMode="decimal" value={initialCapital} onChange={(event) => setInitialCapital(event.target.value)} /></label>
      <label>USDT/Toman conversion rate<input inputMode="decimal" value={conversionRate} onChange={(event) => setConversionRate(event.target.value)} /><small>Used to show the same balance and P&amp;L in USDT.</small></label>
      <label>Entry fee · %<input inputMode="decimal" value={entryFeePct} onChange={(event) => setEntryFeePct(event.target.value)} /></label>
      <label>Exit fee · %<input inputMode="decimal" value={exitFeePct} onChange={(event) => setExitFeePct(event.target.value)} /></label>
    </div>
    <div className="calculatorSummary">
      <article><span>Initial capital</span><strong>{money(capital)} <small>IRT</small></strong><em>{rate > 0 ? `≈ ${money(capital / rate, 6)} USDT` : "Enter a valid conversion rate"}</em></article>
      <article><span>Final balance</span><strong>{money(results.finalEquity)} <small>IRT</small></strong><em>{rate > 0 ? `≈ ${money(results.finalEquity / rate, 6)} USDT` : "— USDT"}</em></article>
      <article className={results.totalProfit >= 0 ? "calculatorPositive" : "calculatorNegative"}><span>Total net P&amp;L</span><strong>{results.totalProfit >= 0 ? "+" : "−"}{money(Math.abs(results.totalProfit))} <small>IRT</small></strong><em>{rate > 0 ? `${results.totalProfit >= 0 ? "+" : "−"}${money(Math.abs(results.totalProfit / rate), 6)} USDT` : "— USDT"}</em></article>
    </div>
    <div className="calculatorTradesHeader"><div><h3>Trade sequence</h3><p>Each trade uses the full available equity as its margin. Profits and losses compound into the next trade.</p></div><button type="button" className="primaryButton" onClick={addTrade}>＋ Add trade</button></div>
    <div className="calculatorTradeList">
      {results.trades.map((trade, index) => <article className="calculatorTrade" key={trade.id}>
        <div className="calculatorTradeTitle"><div><span>TRADE {String(index + 1).padStart(2, "0")}</span><strong>{trade.side === "LONG" ? "Buy USDT · LONG" : "Sell USDT · SHORT"}</strong></div><button type="button" className="calculatorRemove" onClick={() => removeTrade(trade.id)} disabled={trades.length === 1} aria-label={`Remove trade ${index + 1}`}>Remove</button></div>
        <div className="calculatorTradeFields">
          <label>Direction<select value={trade.side} onChange={(event) => updateTrade(trade.id, { side: event.target.value as Side })}><option value="LONG">Buy · LONG</option><option value="SHORT">Sell · SHORT</option></select></label>
          <label>Entry price · Toman<input inputMode="decimal" placeholder="e.g. 270000" value={trade.entry} onChange={(event) => updateTrade(trade.id, { entry: event.target.value })} /></label>
          <label>Exit price · Toman<input inputMode="decimal" placeholder="e.g. 273000" value={trade.exit} onChange={(event) => updateTrade(trade.id, { exit: event.target.value })} /></label>
          <label>Leverage credit · ×<input inputMode="decimal" value={trade.leverage} onChange={(event) => updateTrade(trade.id, { leverage: event.target.value })} /><small>10× credit = margin + 10× borrowed amount = 11× position.</small></label>
        </div>
        <div className="calculatorTradeMeta"><span>Margin at entry <strong>{money(trade.margin)} IRT</strong></span><span>Position value <strong>{money(trade.notional)} IRT</strong></span><span>Price move <strong>{trade.entry && trade.exit ? `${trade.returnPct >= 0 ? "+" : ""}${trade.returnPct.toFixed(3)}%` : "—"}</strong></span></div>
        <div className={trade.net >= 0 ? "calculatorTradeResult isProfit" : "calculatorTradeResult isLoss"}>
          <div><span>Net trade P&amp;L</span><strong>{trade.net >= 0 ? "+" : "−"}{money(Math.abs(trade.net))} IRT</strong><em>{rate > 0 ? `${trade.net >= 0 ? "+" : "−"}${money(Math.abs(trade.net / rate), 6)} USDT` : "— USDT"}</em></div>
          <div><span>Fees estimate</span><strong>{money(trade.fees)} IRT</strong></div>
          <div><span>Equity after trade</span><strong>{money(trade.endingEquity)} IRT</strong><em>{rate > 0 ? `≈ ${money(trade.endingEquity / rate, 6)} USDT` : "— USDT"}</em></div>
        </div>
        {trade.entry && trade.exit && trade.returnPct < 0 && <p className="calculatorLossNote">This trade loses money at the entered prices. Losses are intentionally included in the final balance.</p>}
      </article>)}
    </div>
    <p className="calculatorDisclaimer">Model assumptions: the leverage field is the borrowed-credit multiplier (position value = margin × (1 + leverage)); fees are editable estimates; all equity is reused sequentially; conversion uses one fixed rate. Liquidation, funding, spread/slippage beyond fees, and changing USDT/Toman conversion are not simulated. Large leveraged losses can exceed isolated margin in this simplified calculation.</p>
  </section>;
}
