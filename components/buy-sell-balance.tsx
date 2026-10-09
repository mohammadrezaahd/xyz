"use client";
import type { DataQuality, BuySellBalance as Balance } from "@/lib/opportunity/types";
type Props = { balance: Balance; dataCompleteness: number; dataQuality?: DataQuality; synchronizedCandlePairs?: number; minimumRequiredCandlePairs?: number; netEdgePct?: number | null; decision?: string; compact?: boolean };
export function BuySellBalance({ balance, dataCompleteness, dataQuality, synchronizedCandlePairs, minimumRequiredCandlePairs, netEdgePct, decision, compact = false }: Props) {
  const hasValue = typeof balance.value === "number" && Number.isFinite(balance.value);
  const markerValue = hasValue ? Math.min(100, Math.max(0, balance.value as number)) : 50;
  const valueText = hasValue ? `${Math.round(balance.value as number)} / 100` : "INSUFFICIENT DATA";
  const aria = hasValue ? `Buy and sell directional evidence: ${balance.label}, ${Math.round(balance.value as number)} out of 100` : "Buy and sell directional evidence: insufficient data; directional balance unavailable";
  const reasons = dataQuality?.reasons ?? [];
  const pairs = synchronizedCandlePairs ?? null;
  const requiredPairs = minimumRequiredCandlePairs ?? null;
  const negativeEdge = decision === "NO_TRADE_NEGATIVE_EDGE" || (typeof netEdgePct === "number" && netEdgePct < 0);
  return <section className={`buySellBalance${compact ? " buySellBalance--compact" : ""}`} role="img" aria-label={aria}>
    <div className="balanceHeader"><div><span className="eyebrow">DIRECTIONAL EVIDENCE</span><h3>Buy / Sell Balance</h3></div><strong>{valueText}</strong></div>
    <div className="balanceTrack" aria-hidden="true"><span className="balanceSellZone" /><span className="balanceNeutralZone" /><span className="balanceBuyZone" /><span className={`balanceMarker${hasValue ? "" : " balanceMarker--unknown"}`} style={{ left: `${markerValue}%` }} /></div>
    <div className="balanceLabels"><span>SELL</span><span>BALANCED</span><span>BUY</span></div>
    <div className="balanceDetails"><span>State: <b>{balance.label}</b></span><span>Buy evidence: <b>{balance.buyScore == null ? "—" : Math.round(balance.buyScore)}</b></span><span>Sell evidence: <b>{balance.sellScore == null ? "—" : Math.round(balance.sellScore)}</b></span><span>Data completeness: <b>{Number.isFinite(dataCompleteness) ? `${Math.round(dataCompleteness)}%` : "—"}</b></span></div>
    <p className="balanceSupport">Data completeness measures available inputs. Directional evidence requires the minimum candle history and participation thresholds.</p>
    {!hasValue && <div className="balanceUnavailable"><strong>Directional balance unavailable{pairs !== null && requiredPairs !== null ? `: ${pairs} of ${requiredPairs} required synchronized candle pairs are available.` : "."}</strong><span>Placeholder only · directional evidence unavailable</span>{reasons.length > 0 && <div><b>Data gates:</b><ul>{reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></div>}</div>}
    {negativeEdge && <div className="balanceEconomicGate"><strong>Economic gate: NO_TRADE_NEGATIVE_EDGE</strong><span>Net edge: {netEdgePct == null ? "—" : `${netEdgePct.toFixed(2)}%`}</span></div>}
    {decision && decision.startsWith("NO_TRADE") && <p className="balanceDecision"><b>Final decision: NO TRADE</b></p>}
    <p className="balanceDisclaimer">Directional evidence only · not a calibrated probability of success</p>
  </section>;
}
