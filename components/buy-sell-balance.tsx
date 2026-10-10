"use client";
import type { DataQuality, BuySellBalance as Balance, OpportunityAnalysis } from "@/lib/opportunity/types";
type Props = { balance: Balance; candles?: OpportunityAnalysis["candles"]; dataCompleteness: number; dataQuality?: DataQuality; synchronizedCandlePairs?: number; minimumRequiredCandlePairs?: number; netEdgePct?: number | null; decision?: string; decisionReason?: string; compact?: boolean };
export function BuySellBalance({ balance, candles, dataCompleteness, dataQuality, synchronizedCandlePairs, minimumRequiredCandlePairs, netEdgePct, decision, decisionReason, compact = false }: Props) {
  const hasValue = typeof balance.value === "number" && Number.isFinite(balance.value);
  const markerValue = hasValue ? Math.min(100, Math.max(0, balance.value as number)) : 50;
  const valueText = hasValue ? `${Math.round(balance.value as number)} / 100` : "— / 100";
  const aria = hasValue ? `Buy and sell directional evidence: ${balance.label}, ${Math.round(balance.value as number)} out of 100` : "Buy and sell directional evidence: insufficient data; directional balance unavailable";
  const reasons = dataQuality?.reasons ?? [];
  const pairs = synchronizedCandlePairs ?? null;
  const requiredPairs = minimumRequiredCandlePairs ?? null;
  const negativeEdge = decision === "NO_TRADE_NEGATIVE_EDGE" || (typeof netEdgePct === "number" && netEdgePct < 0);
  const providerLimited = !hasValue && !!candles && (candles.bitpinReceived <= 10 || candles.wallexReceived <= 10);
  const availablePairs = candles?.synchronizedAvailable ?? pairs ?? 0;
  const required = requiredPairs ?? candles?.minimumRequired ?? 20;
  const enoughHistory = availablePairs >= required && (candles?.synchronizedUsed ?? 0) >= required;
  const weakParticipation = enoughHistory && (candles?.directionalParticipationRatio == null || candles.directionalParticipationRatio < 0.5);
  const waitingForHistory = !hasValue && !providerLimited && !enoughHistory;
  return <section className={`buySellBalance${compact ? " buySellBalance--compact" : ""}`} role="img" aria-label={aria}>
    <div className="balanceHeader"><div><span className="eyebrow">DIRECTIONAL EVIDENCE</span><h3>Buy / Sell Balance</h3></div><strong>{valueText}</strong></div>
    <div className="balanceTrack" aria-hidden="true"><span className="balanceSellZone" /><span className="balanceNeutralZone" /><span className="balanceBuyZone" /><span className={`balanceMarker${hasValue ? "" : " balanceMarker--unknown"}`} style={{ left: `${markerValue}%`, opacity: hasValue ? 1 : 0.42 }} /></div>
    <div className="balanceLabels"><span>SELL</span><span>{hasValue ? (balance.label === "BALANCED" ? "BALANCED" : "DIRECTIONAL SCORE") : "N/A"}</span><span>BUY</span></div>
    {compact && <div className="balanceCompactSummary"><strong>{decision?.startsWith("NO_TRADE") ? "NO TRADE" : decision ?? "WAITING"}</strong><span>{decisionReason ?? "Decision is gated by data quality and net edge."}</span></div>}
    {!compact && <div className="balanceDetails"><span>State: <b>{hasValue ? (balance.label === "SELL BIAS" ? "SELL BIAS · RESEARCH ONLY" : balance.label) : "INSUFFICIENT DATA"}</b></span><span>Buy evidence: <b>{balance.buyScore == null ? "—" : Math.round(balance.buyScore)}</b></span><span>Sell evidence: <b>{balance.sellScore == null ? "—" : Math.round(balance.sellScore)}</b></span><span>Data completeness: <b>{Number.isFinite(dataCompleteness) ? `${Math.round(dataCompleteness)}%` : "—"}</b></span><span>Directional agreement: <b>{candles?.directionalAgreementRatio == null ? "—" : `${(candles.directionalAgreementRatio * 100).toFixed(1)}%`}</b></span><span>Directional participation: <b>{candles?.directionalParticipationRatio == null ? "—" : `${(candles.directionalParticipationRatio * 100).toFixed(1)}%`}</b></span><span>Stability alignment (last {candles?.stabilityLookback ?? 10}): <b>{candles?.alignmentRatio == null ? "—" : `${(candles.alignmentRatio * 100).toFixed(1)}%`}</b></span></div>}
    {!compact && <p className="balanceSupport">Data completeness measures available inputs. Directional evidence requires the minimum candle history and participation thresholds.</p>}
    {!compact && <div className="balanceDiagnostics" aria-label="Candle synchronization diagnostics">
      <strong>Directional evidence requires at least {requiredPairs ?? 20} synchronized closed candle pairs.</strong>
      <div>Bitpin candles received: <b>{candles?.bitpinReceived ?? "—"}</b></div>
      <div>Wallex candles received: <b>{candles?.wallexReceived ?? "—"}</b></div>
      <div>Synchronized closed pairs: <b>{candles?.synchronizedAvailable ?? pairs ?? "—"}</b></div>
      <div>Pairs used for analysis: <b>{candles?.synchronizedUsed ?? "—"}</b></div>
      <div>Minimum required: <b>{requiredPairs ?? candles?.minimumRequired ?? 20}</b></div>
      <div className={hasValue ? "balanceReadiness isReady" : "balanceReadiness isWaiting"}>Directional evidence: <b>{hasValue ? "READY" : providerLimited ? "PROVIDER LIMITATION" : weakParticipation ? "DIRECTIONAL PARTICIPATION TOO LOW" : "WAITING FOR DATA"}</b></div>
      {waitingForHistory && <div>{availablePairs} of {required} required pairs available. Waiting for {Math.max(0, required - availablePairs)} more valid pairs.</div>}{weakParticipation && <div>History is sufficient ({availablePairs} synchronized pairs), but only {Math.round((candles?.directionalParticipationRatio ?? 0) * 100)}% meets the directional movement threshold. This is a market-signal quality issue, not missing candle history.</div>}
      {!hasValue && candles && (candles.bitpinReceived <= 10 || candles.wallexReceived <= 10) && <div className="providerLimitedWarning">Historical candle provider is returning only 10 or fewer candles. This is a provider/history limitation, not normal accumulation.</div>}
    </div>}
    {!compact && !hasValue && <div className="balanceUnavailable"><strong>INSUFFICIENT DATA</strong><span>— · Directional evidence unavailable. Placeholder only; no balanced score is being reported.</span>{reasons.length > 0 && <div><b>Data gates:</b><ul>{reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></div>}</div>}
    {!compact && <section className="balanceDecisionGates" aria-label="Separate decision gates">
      <div><span>Directional gate</span><strong>{hasValue ? <>READY · {candles?.synchronizedAvailable ?? pairs ?? 0} synchronized pairs</> : providerLimited ? "PROVIDER LIMITATION" : weakParticipation ? "DIRECTIONAL PARTICIPATION TOO LOW" : "INSUFFICIENT DATA"}</strong></div>
      <div><span>Economic gate</span><strong>{negativeEdge ? "NO_TRADE_NEGATIVE_EDGE" : decision?.startsWith("NO_TRADE") ? decision : decision ? "ECONOMIC GATE READY" : "WAITING"}</strong><small>Net edge: {netEdgePct == null ? "—" : `${netEdgePct.toFixed(2)}%`}</small></div>
      <div><span>Final decision</span><strong>{decision?.startsWith("NO_TRADE") ? "NO TRADE" : decision ?? "WAITING"}</strong><small>{decisionReason ?? reasons[0] ?? "Waiting for all decision gates."}</small></div>
    </section>}
    {!compact && <p className="balanceDisclaimer">Directional evidence only · not a calibrated probability of success. A BUY or SELL bias does not override quote, target, stability, or economic gates.</p>}
  </section>;
}
