"use client";

import { useCallback, useEffect, useState } from "react";

type TestAccount = {
  initialCapital: number;
  availableCapital: number;
  equity: number;
};

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
  initialCapital: number;
  margin: number;
  leverage: number;
  leveragedCredit: number;
  positionNotional: number;
  entryPrice: number;
  targetPrice: number;
  liquidationPrice: number;
  entryFeePct: number;
  exitFeePct: number;
  entryFee: number;
  exitFee: number | null;
  totalFees: number;
  grossPnl: number;
  netPnl: number;
  currentPrice: number | null;
  currentEquity: number;
  exitPrice: number | null;
  entryAt: string;
  closedAt: string | null;
  exitReason: string | null;
  monitoring: {
    lastCheckedAt: string | null;
    lastError: string | null;
  };
};

function formatMoney(value: number | null) {
  return value === null
    ? "—"
    : value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

function formatDuration(entryAt: string, closedAt: string | null) {
  if (!closedAt) return "Open";
  const minutes = Math.max(
    0,
    Math.floor(
      (new Date(closedAt).getTime() - new Date(entryAt).getTime()) / 60000,
    ),
  );
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function resultClass(value: string | null) {
  return `phase4Result ${value?.toLowerCase().replaceAll("_", "-") ?? "pending"}`;
}

export function TestPositionPanel({ refreshKey }: { refreshKey: number }) {
  const [account, setAccount] = useState<TestAccount | null>(null);
  const [open, setOpen] = useState<TestPosition[]>([]);
  const [history, setHistory] = useState<TestPosition[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/test-positions", { cache: "no-store" });
      const data = (await response.json()) as {
        account?: TestAccount;
        open?: TestPosition[];
        history?: TestPosition[];
        error?: string;
      };

      if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
      setAccount(data.account ?? null);
      setOpen(data.open ?? []);
      setHistory(data.history ?? []);
      setError("");
    } catch (value) {
      setError(
        value instanceof Error ? value.message : "Unable to load paper account",
      );
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
      setError(
        value instanceof Error ? value.message : "Unable to close position",
      );
    }
  }

  return (
    <section className="phase4 card">
      <div className="opportunityHeader">
        <div>
          <div className="exchange">Paper Trading Simulator</div>
          <div className="symbol">
            Simulated account · live Bitpin market data · no real trading
          </div>
        </div>
        {account && (
          <div className="phase4Config">
            <span>Account Capital</span>
            <strong>{formatMoney(account.initialCapital)} IRR</strong>
            <span>Available</span>
            <strong>{formatMoney(account.availableCapital)} IRR</strong>
            <span>Equity</span>
            <strong>{formatMoney(account.equity)} IRR</strong>
          </div>
        )}
      </div>

      <div className="phase4AccountNotice">
        <strong>Capital and exposure are different.</strong>
        <span>
          Margin is reserved from the simulated account. Leveraged credit only
          increases position exposure and is never added to available capital.
        </span>
      </div>

      <div className="phase4Current">
        <h3>Open Positions</h3>
        {open.length > 0 ? (
          <div className="phase4OpenGrid">
            {open.map((position) => (
              <article className="phase4PositionCard" key={position._id}>
                <div className="phase4PositionHead">
                  <div>
                    <span className="phase4Badge open">OPEN</span>
                    <strong>{position.direction}</strong>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      position._id && void closePosition(position._id)
                    }
                  >
                    Close Position
                  </button>
                </div>

                <div className="phase4Grid">
                  <div><span>Entry · Bitpin</span><strong>{formatMoney(position.entryPrice)}</strong></div>
                  <div><span>Current</span><strong>{formatMoney(position.currentPrice)}</strong></div>
                  <div><span>Target</span><strong>{formatMoney(position.targetPrice)}</strong></div>
                  <div><span>Liquidation Price</span><strong>{formatMoney(position.liquidationPrice)}</strong></div>
                  <div><span>Initial Capital</span><strong>{formatMoney(position.initialCapital)}</strong></div>
                  <div><span>Margin</span><strong>{formatMoney(position.margin)}</strong></div>
                  <div><span>Leverage</span><strong>{position.leverage}x</strong></div>
                  <div><span>Leveraged Credit</span><strong>{formatMoney(position.leveragedCredit)}</strong></div>
                  <div><span>Exposure</span><strong>{formatMoney(position.positionNotional)}</strong></div>
                  <div><span>Unrealized PnL</span><strong>{formatMoney(position.grossPnl)}</strong></div>
                  <div><span>Current Equity</span><strong>{formatMoney(position.currentEquity)}</strong></div>
                  <div><span>Estimated Fees</span><strong>{formatMoney(position.totalFees)}</strong></div>
                  <div><span>Entry Fee</span><strong>{formatMoney(position.entryFee)}</strong></div>
                  <div><span>Exit Fee Estimate</span><strong>{formatMoney(position.currentEquity === null ? null : position.totalFees - position.entryFee)}</strong></div>
                  <div><span>Last Checked</span><strong>{formatDate(position.monitoring.lastCheckedAt)}</strong></div>
                </div>

                {position.monitoring.lastError && (
                  <div className="phase4Warning">
                    Monitoring retry pending: {position.monitoring.lastError}
                  </div>
                )}
              </article>
            ))}
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
                  <th>Status</th>
                  <th>Result</th>
                  <th>Entry</th>
                  <th>Exit</th>
                  <th>Target</th>
                  <th>Liquidation</th>
                  <th>Capital</th>
                  <th>Leverage</th>
                  <th>Exposure</th>
                  <th>Gross PnL</th>
                  <th>Entry Fee</th>
                  <th>Exit Fee</th>
                  <th>Total Fees</th>
                  <th>Net PnL</th>
                  <th>Final Equity</th>
                  <th>Exit Reason</th>
                  <th>Duration</th>
                </tr>
              </thead>
              <tbody>
                {history.map((position) => (
                  <tr key={position._id}>
                    <td>
                      <span className={`phase4Badge ${position.status.toLowerCase()}`}>
                        {position.status}
                      </span>
                    </td>
                    <td>
                      <span className={resultClass(position.result)}>
                        {position.result ?? "—"}
                      </span>
                    </td>
                    <td>{formatMoney(position.entryPrice)}</td>
                    <td>{formatMoney(position.exitPrice)}</td>
                    <td>{formatMoney(position.targetPrice)}</td>
                    <td>{formatMoney(position.liquidationPrice)}</td>
                    <td>{formatMoney(position.initialCapital)}</td>
                    <td>{position.leverage}x</td>
                    <td>{formatMoney(position.positionNotional)}</td>
                    <td>{formatMoney(position.grossPnl)}</td>
                    <td>{formatMoney(position.entryFee)}</td>
                    <td>{formatMoney(position.exitFee)}</td>
                    <td>{formatMoney(position.totalFees)}</td>
                    <td>{formatMoney(position.netPnl)}</td>
                    <td>{formatMoney(position.currentEquity)}</td>
                    <td>{position.exitReason ?? "—"}</td>
                    <td>{formatDuration(position.entryAt, position.closedAt)}</td>
                  </tr>
                ))}
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
