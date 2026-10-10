"use client";
import type { DataQuality, BuySellBalance as Balance, OpportunityAnalysis } from "@/lib/opportunity/types";
type Props = { balance: Balance; candles?: OpportunityAnalysis["candles"]; dataCompleteness: number; dataQuality?: DataQuality; synchronizedCandlePairs?: number; minimumRequiredCandlePairs?: number; netEdgePct?: number | null; decision?: string; compact?: boolean };
export function BuySellBalance({ balance, candles, dataCompleteness, dataQuality, synchronizedCandlePairs, minimumRequiredCandlePairs, netEdgePct, decision, compact = false }: Props) {
  const hasValue = typeof balance.value === "number" && Number.isFinite(balance.value);
  const markerValue = hasValue ? Math.min(100, Math.max(0, balance.value as number)) : 50;
  const valueText = hasValue ? `${Math.round(balance.value as number)} / 100` : "— / 100";
  const aria = hasValue ? `Buy and sell directional evidence: ${balance.label}, ${Math.round(balance.value as number)} out of 100` : "Buy and sell directional evidence: insufficient data; directional balance unavailable";
  const reasons = dataQuality?.reasons ?? [];
  const pairs = synchronizedCandlePairs ?? null;
  const requiredPairs = minimumRequiredCandlePairs ?? null;
  const negativeEdge = decision === "NO_TRADE_NEGATIVE_EDGE" || (typeof netEdgePct === "number" && netEdgePct < 0);
  return <section className={`buySellBalance${compact ? " buySellBalance--compact" : ""}`} role="img" aria-label={aria}>
    <div className="balanceHeader"><div><span className="eyebrow">DIRECTIONAL EVIDENCE</span><h3>Buy / Sell Balance</h3></div><strong>{valueText}</strong></div>
    <div className="balanceTrack" aria-hidden="true"><span className="balanceSellZone" /><span className="balanceNeutralZone" /><span className="balanceBuyZone" /><span className={`balanceMarker${hasValue ? "" : " balanceMarker--unknown"}`} style={{ left: `${markerValue}%`, opacity: hasValue ? 1 : 0.42 }} /></div>
    <div className="balanceLabels"><span>SELL</span><span>{hasValue ? (balance.label === "BALANCED" ? "BALANCED" : "DIRECTIONAL SCORE") : "N/A"}</span><span>BUY</span></div>
    <div className="balanceDetails"><span>State: <b>{hasValue ? (balance.label === "SELL BIAS" ? "SELL BIAS · RESEARCH ONLY" : balance.label) : "INSUFFICIENT DATA"}</b></span><span>Buy evidence: <b>{balance.buyScore == null ? "—" : Math.round(balance.buyScore)}</b></span><span>Sell evidence: <b>{balance.sellScore == null ? "—" : Math.round(balance.sellScore)}</b></span><span>Data completeness: <b>{Number.isFinite(dataCompleteness) ? `${Math.round(dataCompleteness)}%` : "—"}</b></span></div>
    <p className="balanceSupport">Data completeness measures available inputs. Directional evidence requires the minimum candle history and participation thresholds.</p>
    <div className="balanceDiagnostics" aria-label="Candle synchronization diagnostics">
      <strong>Directional evidence requires at least {requiredPairs ?? 20} synchronized closed candle pairs.</strong>
      <div>Bitpin candles received: <b>{candles?.bitpinReceived ?? "—"}</b></div>
      <div>Wallex candles received: <b>{candles?.wallexReceived ?? "—"}</b></div>
      <div>Synchronized closed pairs: <b>{candles?.synchronizedAvailable ?? pairs ?? "—"}</b></div>
      <div>Pairs used for analysis: <b>{candles?.synchronizedUsed ?? "—"}</b></div>
      <div>Minimum required: <b>{requiredPairs ?? candles?.minimumRequired ?? 20}</b></div>
      <div className={hasValue ? "balanceReadiness isReady" : "balanceReadiness isWaiting"}>Directional evidence: <b>{hasValue ? "READY" : "WAITING FOR DATA"}</b></div>
      {!hasValue && <div>{pairs ?? candles?.synchronizedAvailable ?? 0} of {requiredPairs ?? 20} required pairs available. Waiting for more valid pairs: {Math.max(0, (requiredPairs ?? 20) - (pairs ?? candles?.synchronizedAvailable ?? 0))}.</div>}
    </div>
    {!hasValue && <div className="balanceUnavailable"><strong>INSUFFICIENT DATA</strong><span>— · Directional evidence unavailable. Placeholder only; no balanced score is being reported.</span>{reasons.length > 0 && <div><b>Data gates:</b><ul>{reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></div>}</div>}
    {negativeEdge && <div className="balanceEconomicGate"><strong>Economic gate: NO_TRADE_NEGATIVE_EDGE</strong><span>Net edge: {netEdgePct == null ? "—" : `${netEdgePct.toFixed(2)}%`}</span></div>}
    {decision && decision.startsWith("NO_TRADE") && <p className="balanceDecision"><b>Final decision: NO TRADE</b></p>}
    <p className="balanceDisclaimer">Directional evidence only · not a calibrated probability of success. A BUY or SELL bias does not override quote, target, stability, or economic gates.</p>
  </section>;
}
