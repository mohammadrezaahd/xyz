import type { BuySellBalance } from "@/lib/opportunity/types";

type Props = {
  balance: BuySellBalance;
  dataCompleteness: number;
  compact?: boolean;
};

export function BuySellBalance({ balance, dataCompleteness, compact = false }: Props) {
  const hasValue = typeof balance.value === "number" && Number.isFinite(balance.value);
  const markerValue = hasValue ? Math.min(100, Math.max(0, balance.value as number)) : 50;
  const valueText = hasValue ? `${Math.round(balance.value as number)} / 100` : "INSUFFICIENT DATA";
  const aria = hasValue
    ? `Buy and sell directional evidence: ${balance.label}, ${Math.round(balance.value as number)} out of 100`
    : "Buy and sell directional evidence: insufficient data; directional balance unavailable";
  return (
    <section className={`buySellBalance${compact ? " buySellBalance--compact" : ""}`} role="img" aria-label={aria}>
      <div className="balanceHeader">
        <div><span className="eyebrow">DIRECTIONAL EVIDENCE</span><h3>Buy / Sell Balance</h3></div>
        <strong>{valueText}</strong>
      </div>
      <div className="balanceTrack" aria-hidden="true">
        <span className="balanceSellZone" /><span className="balanceNeutralZone" /><span className="balanceBuyZone" />
        <span className={`balanceMarker${hasValue ? "" : " balanceMarker--unknown"}`} style={{ left: `${markerValue}%` }} />
      </div>
      <div className="balanceLabels"><span>SELL</span><span>BALANCED</span><span>BUY</span></div>
      <div className="balanceDetails">
        <span>State: <b>{balance.label}</b></span>
        <span>Buy evidence: <b>{balance.buyScore == null ? "—" : Math.round(balance.buyScore)}</b></span>
        <span>Sell evidence: <b>{balance.sellScore == null ? "—" : Math.round(balance.sellScore)}</b></span>
        <span>Data completeness: <b>{Number.isFinite(dataCompleteness) ? `${Math.round(dataCompleteness)}%` : "—"}</b></span>
      </div>
      <p className="balanceDisclaimer">Directional evidence only · not a calibrated probability of success</p>
    </section>
  );
}
