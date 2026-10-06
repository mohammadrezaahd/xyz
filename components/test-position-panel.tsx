"use client";

import { useCallback, useEffect, useState } from "react";

type TestPosition = {
  _id?: string;
  opportunityId: string;
  status: "OPEN" | "CLOSED" | "LIQUIDATED";
  result:
    | "PREDICT_SUCCESS"
    | "RELATIVELY_SUCCESSFUL"
    | "FAILED"
    | "LIQUIDATED"
    | null;
  direction: "SHORT";
  entryPrice: number;
  targetPrice: number;
  liquidationPrice: number;
  exitPrice: number | null;
  initialCapital: number;
  leverage: number;
  leveragedCredit: number;
  positionNotional: number;
  entryFeePct: number;
  exitFeePct: number;
  entryFee: number;
  exitFee: number | null;
  totalFees: number;
  grossPnl: number;
  netPnl: number;
  opportunityStrength: string;
  entryAt: string;
  closedAt: string | null;
  exitReason: string | null;
  monitoring: {
    currentBitpinPrice: number | null;
    lastCheckedAt: string | null;
    lastError: string | null;
  };
};

function formatPrice(value: number | null) {
  return value === null ? "—" : value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

function formatPnl(value: number) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function resultClass(value: string | null) {
  return `phase4Result ${value?.toLowerCase().replaceAll("_", "-") ?? "pending"}`;
}

export function TestPositionPanel({ refreshKey }: { refreshKey: number }) {
  const [open, setOpen] = useState<TestPosition[]>([]);
  const [history, setHistory] = useState<TestPosition[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/test-positions", { cache: "no-store" });
      const data = (await response.json()) as {
        open?: TestPosition[];
        history?: TestPosition[];
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
      setOpen(data.open ?? []);
      setHistory(data.history ?? []);
      setError("");
    } catch (value) {
      setError(value instanceof Error ? value.message : "Unable to load test positions");
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 15000);
    return () => window.clearInterval(timer);
  }, [load, refreshKey]);

  async function closePosition(id: string) {
    try {
      const response = await fetch(`/api/test-positions/${id}/close`, {
        method: "POST",
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Unable to close position");
    }
  }

  return (
    <section className="phase4 card">
      <div className="opportunityHeader">
        <div>
          <div className="exchange">Paper / Test Positions</div>
          <div className="symbol">Live Bitpin monitoring · no real trading or real money</div>
        </div>
        <div className="phase4Config">
          <span>Capital</span><strong>1,000,000 IRR</strong>
          <span>Leverage</span><strong>20x</strong>
          <span>Position</span><strong>21,000,000 IRR</strong>
        </div>
      </div>

      <div className="phase4Current">
        <h3>Open Positions</h3>
        {open.length > 0 ? (
          <div className="phase4OpenGrid">
            {open.map((position) => {
              const current = position.monitoring.currentBitpinPrice;
              const estimatedPnl =
                current === null
                  ? null
                  : position.positionNotional *
                      ((position.entryPrice - current) / position.entryPrice) -
                    position.entryFee -
                    position.positionNotional *
                      (current / position.entryPrice) *
                      (position.exitFeePct / 100);
              return (
                <article className="phase4PositionCard" key={position._id}>
                  <div className="phase4PositionHead">
                    <div>
                      <span className="phase4Badge open">OPEN</span>
                      <strong>{position.direction}</strong>
                    </div>
                    <button type="button" onClick={() => position._id && void closePosition(position._id)}>
                      Close Position
                    </button>
                  </div>
                  <div className="phase4Grid">
                    <div><span>Entry · Bitpin</span><strong>{formatPrice(position.entryPrice)}</strong></div>
                    <div><span>Current</span><strong>{formatPrice(current)}</strong></div>
                    <div><span>Target</span><strong>{formatPrice(position.targetPrice)}</strong></div>
                    <div><span>Est. Liquidation</span><strong>{formatPrice(position.liquidationPrice)}</strong></div>
                    <div><span>Capital</span><strong>{formatPrice(position.initialCapital)}</strong></div>
                    <div><span>Leverage</span><strong>{position.leverage}x</strong></div>
                    <div><span>Position Size</span><strong>{formatPrice(position.positionNotional)}</strong></div>
                    <div><span>Unrealized PnL</span><strong>{estimatedPnl === null ? "—" : formatPnl(estimatedPnl)}</strong></div>
                    <div><span>Estimated Fees</span><strong>{estimatedPnl === null ? "—" : formatPnl(position.entryFee + position.positionNotional * (current! / position.entryPrice) * (position.exitFeePct / 100))}</strong></div>
                    <div><span>Checked</span><strong>{formatDate(position.monitoring.lastCheckedAt)}</strong></div>
                  </div>
                  {position.monitoring.lastError && (
                    <div className="phase4Warning">Monitoring retry pending: {position.monitoring.lastError}</div>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="phase3Empty">No OPEN paper positions.</div>
        )}
      </div>

      <div className="phase4History">
        <h3>Position History</h3>
        {history.length > 0 ? (
          <div className="phase3TableWrap">
            <table className="phase3Table">
              <thead>
                <tr>
                  <th>Status</th><th>Result</th><th>Entry</th><th>Exit</th><th>Target</th>
                  <th>Liquidation</th><th>Leverage</th><th>Position</th><th>PnL</th>
                  <th>Fees</th><th>Exit Reason</th><th>Duration</th>
                </tr>
              </thead>
              <tbody>
                {history.map((position) => {
                  const duration =
                    position.closedAt
                      ? Math.max(
                          0,
                          new Date(position.closedAt).getTime() -
                            new Date(position.entryAt).getTime(),
                        )
                      : null;
                  const durationMinutes =
                    duration === null ? null : Math.floor(duration / 60000);
                  return (
                    <tr key={position._id}>
                      <td><span className={`phase4Badge ${position.status.toLowerCase()}`}>{position.status}</span></td>
                      <td><span className={resultClass(position.result)}>{position.result ?? "—"}</span></td>
                      <td>{formatPrice(position.entryPrice)}</td>
                      <td>{formatPrice(position.exitPrice)}</td>
                      <td>{formatPrice(position.targetPrice)}</td>
                      <td>{formatPrice(position.liquidationPrice)}</td>
                      <td>{position.leverage}x</td>
                      <td>{formatPrice(position.positionNotional)}</td>
                      <td>{formatPnl(position.netPnl)}</td>
                      <td>{formatPnl(position.totalFees)}</td>
                      <td>{position.exitReason ?? "—"}</td>
                      <td>{durationMinutes === null ? "—" : `${durationMinutes}m`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="phase3Empty">No historical paper positions yet.</div>
        )}
      </div>

      {error && <div className="error">{error}</div>}
    </section>
  );
}
