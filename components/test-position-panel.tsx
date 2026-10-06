"use client";

import { useEffect, useMemo, useState } from "react";
import { markPosition } from "@/lib/test-position/calculations";

type Opportunity = {
  _id?: string | { $oid?: string };
  status: string;
  direction: "SHORT";
  opportunityStrength: string;
  entry: { price: number };
  target?: { price: number };
  analysis: { score: number };
  riskLevel?: string;
};

type Position = {
  _id?: string;
  opportunityId: string | null;
  status: "OPEN" | "CLOSED" | "LIQUIDATED";
  result:
    | "PREDICT_SUCCESS"
    | "RELATIVELY_SUCCESSFUL"
    | "FAILED"
    | "LIQUIDATED"
    | null;
  direction: "LONG";
  initialCapital: number;
  margin: number;
  leverage: 5 | 10 | 20;
  leveragedCredit: number;
  positionNotional: number;
  usdtQuantity: number;
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
  opportunitySnapshot: {
    opportunityId: string;
    opportunityStrength: string;
    direction: "SHORT";
    score: number;
    suggestedEntryPrice: number;
    suggestedTargetPrice: number;
    riskLevel: string | null;
  } | null;
  riskSnapshot: {
    source: "OPPORTUNITY" | "MANUAL";
    opportunityStrength: string | null;
    score: number | null;
    riskLevel: string | null;
    direction: "LONG";
  };
  monitoring: {
    lastCheckedAt: string | null;
    lastError: string | null;
  };
};

const LEVERAGES = [5, 10, 20] as const;
const LIVE_PRICE_POLL_MS = 1500;

function money(value: number | null) {
  return value === null
    ? "—"
    : value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function date(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

function duration(start: string, end: string | null) {
  if (!end) return "Open";
  const minutes = Math.max(
    0,
    Math.floor(
      (new Date(end).getTime() - new Date(start).getTime()) / 60000,
    ),
  );
  return minutes < 60
    ? minutes + "m"
    : Math.floor(minutes / 60) + "h " + (minutes % 60) + "m";
}

export function TestPositionPanel({
  refreshKey,
  currentPrice,
}: {
  refreshKey: number;
  currentPrice: number | null;
}) {
  const [open, setOpen] = useState<Position[]>([]);
  const [history, setHistory] = useState<Position[]>([]);
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [livePrice, setLivePrice] = useState<number | null>(currentPrice);
  const [capital, setCapital] = useState(1_000_000);
  const [leverage, setLeverage] = useState<5 | 10 | 20>(20);
  const [target, setTarget] = useState("");
  const [useOpportunity, setUseOpportunity] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const [positionsResponse, opportunityResponse] = await Promise.all([
        fetch("/api/test-positions", { cache: "no-store" }),
        fetch("/api/opportunities", { cache: "no-store" }),
      ]);

      const positionData = (await positionsResponse.json()) as {
        open?: Position[];
        history?: Position[];
        error?: string;
      };
      const opportunityData = (await opportunityResponse.json()) as {
        open?: Opportunity | null;
      };

      if (!positionsResponse.ok) {
        throw new Error(positionData.error ?? "Unable to load positions");
      }

      setOpen(positionData.open ?? []);
      setHistory(positionData.history ?? []);
      setOpportunity(opportunityData.open ?? null);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load Phase 4");
    }
  }

  useEffect(() => {
    void load();

    const timer = window.setInterval(() => {
      void load();
    }, 15000);

    return () => window.clearInterval(timer);
  }, [refreshKey]);

  useEffect(() => {
    setLivePrice(currentPrice);
  }, [currentPrice]);

  useEffect(() => {
    if (open.length === 0) return;

    let cancelled = false;

    const poll = async () => {
      try {
        const response = await fetch("/api/prices", { cache: "no-store" });
        const data = (await response.json()) as {
          bitpin?: number | null;
        };

        if (!response.ok) return;
        if (!cancelled && typeof data.bitpin === "number" && data.bitpin > 0) {
          setLivePrice(data.bitpin);
        }
      } catch {
        // The server-side cron remains responsible for authoritative monitoring.
        // A temporary UI polling failure must not invent a price.
      }
    };

    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, LIVE_PRICE_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [open.length]);

  useEffect(() => {
    if (target) return;

    if (livePrice !== null && livePrice > 0) {
      setTarget(String(livePrice * 1.005));
    }
  }, [livePrice, target]);

  const exposure = capital * (leverage + 1);
  const quantity =
    livePrice !== null && livePrice > 0 ? exposure / livePrice : null;
  const liquidation =
    livePrice !== null && livePrice > 0
      ? livePrice * (1 - 1 / (leverage + 1))
      : null;

  async function start() {
    setBusy(true);
    setError("");

    try {
      const targetPrice = Number(target);
      if (
        !Number.isFinite(targetPrice) ||
        targetPrice <= 0 ||
        (livePrice !== null && targetPrice < livePrice)
      ) {
        throw new Error("LONG target must be at or above the current price");
      }

      const opportunityId =
        useOpportunity && opportunity
          ? String(
              opportunity._id && typeof opportunity._id === "object"
                ? opportunity._id.$oid
                : opportunity._id,
            )
          : null;

      const response = await fetch("/api/test-positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initialCapital: capital,
          leverage,
          targetPrice,
          opportunityId,
        }),
      });

      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Unable to start test");
      }

      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to start test");
    } finally {
      setBusy(false);
    }
  }

  async function close(id: string) {
    try {
      const response = await fetch("/api/test-positions/" + id + "/close", {
        method: "POST",
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to close");
      }

      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to close");
    }
  }

  async function editTarget(id: string, value: number) {
    try {
      const position = open.find((item) => item._id === id);
      if (!position) return;

      if (!Number.isFinite(value) || value < position.entryPrice) {
        throw new Error("LONG target must be at or above entry price");
      }

      const response = await fetch(
        "/api/test-positions/" + id + "/target",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetPrice: value }),
        },
      );
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to update target");
      }

      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to update target",
      );
    }
  }

  const liveMarks = useMemo(() => {
    if (livePrice === null || livePrice <= 0) return new Map<string, ReturnType<typeof markPosition>>();

    return new Map(
      open
        .filter((position) => position._id)
        .map((position) => [
          position._id as string,
          markPosition(position, livePrice),
        ]),
    );
  }, [livePrice, open]);

  return (
    <section className="phase4 card">
      <div className="opportunityHeader">
        <div>
          <div className="exchange">Paper Trading Simulator</div>
          <div className="symbol">
            Training mode · live Bitpin market data · no real trading
          </div>
        </div>
      </div>

      <div className="phase4StartRow">
        <label className="phase4Input">
          <span>Capital</span>
          <input
            type="number"
            min="1"
            step="1"
            value={capital}
            onChange={(e) => setCapital(Number(e.target.value))}
          />
        </label>

        <label className="phase4Input">
          <span>Leverage</span>
          <select
            value={leverage}
            onChange={(e) =>
              setLeverage(Number(e.target.value) as 5 | 10 | 20)
            }
          >
            {LEVERAGES.map((value) => (
              <option key={value} value={value}>
                {value}x
              </option>
            ))}
          </select>
        </label>

        <div className="phase4Input">
          <span>Current Bitpin Price</span>
          <strong>{money(livePrice)}</strong>
        </div>

        <div className="phase4Input">
          <span>USDT Quantity</span>
          <strong>
            {quantity === null ? "—" : quantity.toFixed(6)}
          </strong>
        </div>

        <div className="phase4Input">
          <span>Position Exposure</span>
          <strong>{money(exposure)}</strong>
        </div>

        <label className="phase4Input">
          <span>Buy / Target Price</span>
          <input
            type="number"
            min={livePrice ?? 0}
            step="0.01"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </label>

        <div className="phase4Input">
          <span>Estimated Liquidation</span>
          <strong>{money(liquidation)}</strong>
        </div>

        <button
          className="phase4StartButton"
          type="button"
          disabled={
            busy ||
            !Number.isFinite(capital) ||
            capital <= 0 ||
            !Number.isFinite(Number(target)) ||
            Number(target) <= 0 ||
            (livePrice !== null && Number(target) < livePrice)
          }
          onClick={() => void start()}
        >
          {busy ? "Starting…" : "Start Test"}
        </button>
      </div>

      {opportunity && (
        <div className="phase4AccountNotice">
          <strong>Opportunity Context</strong>
          <span>
            Score {opportunity.analysis.score} / 100 ·{" "}
            {opportunity.opportunityStrength} · Risk{" "}
            {opportunity.riskLevel ?? "—"}
          </span>
          <label>
            <input
              type="checkbox"
              checked={useOpportunity}
              onChange={(e) => setUseOpportunity(e.target.checked)}
            />
            Attach this Opportunity as historical context
          </label>
        </div>
      )}

      <div className="phase4Current">
        <h3>Open Positions</h3>

        {open.length ? (
          open.map((position) => {
            const mark = position._id
              ? liveMarks.get(position._id)
              : undefined;
            const displayPrice = livePrice ?? position.currentPrice;
            const estimatedExitFee =
              mark?.estimatedExitFee ??
              Math.max(0, position.totalFees - position.entryFee);
            const currentGrossPnl = mark?.grossPnl ?? position.grossPnl;
            const currentNetPnl = mark?.netPnl ?? position.netPnl;
            const currentEquity =
              mark?.currentEquity ?? position.currentEquity;
            const targetReached =
              displayPrice !== null && displayPrice >= position.targetPrice;
            const liquidationReached =
              displayPrice !== null &&
              displayPrice <= position.liquidationPrice;

            return (
              <article
                className="phase4PositionCard"
                key={position._id}
              >
                <div className="phase4PositionHead">
                  <div>
                    <span className="phase4Badge open">OPEN</span>{" "}
                    <strong>LONG</strong>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      position._id && void close(position._id)
                    }
                  >
                    Close Position
                  </button>
                </div>

                <div className="phase4Grid">
                  <div>
                    <span>Entry · Bitpin</span>
                    <strong>{money(position.entryPrice)}</strong>
                  </div>
                  <div>
                    <span>Current</span>
                    <strong>{money(displayPrice)}</strong>
                  </div>
                  <div>
                    <span>Target</span>
                    <input
                      key={String(position.targetPrice)}
                      type="number"
                      min={position.entryPrice}
                      step="0.01"
                      defaultValue={position.targetPrice}
                      onBlur={(e) =>
                        void editTarget(
                          position._id ?? "",
                          Number(e.currentTarget.value),
                        )
                      }
                    />
                  </div>
                  <div>
                    <span>Liquidation</span>
                    <strong>{money(position.liquidationPrice)}</strong>
                  </div>

                  <div>
                    <span>User Capital</span>
                    <strong>{money(position.initialCapital)}</strong>
                  </div>
                  <div>
                    <span>Leverage</span>
                    <strong>{position.leverage}x</strong>
                  </div>
                  <div>
                    <span>Leveraged Credit</span>
                    <strong>{money(position.leveragedCredit)}</strong>
                  </div>
                  <div>
                    <span>Position Exposure</span>
                    <strong>{money(position.positionNotional)}</strong>
                  </div>
                  <div>
                    <span>USDT Quantity</span>
                    <strong>{position.usdtQuantity.toFixed(6)}</strong>
                  </div>

                  <div>
                    <span>Gross PnL</span>
                    <strong>{money(currentGrossPnl)}</strong>
                  </div>
                  <div>
                    <span>Estimated Exit Fee</span>
                    <strong>{money(estimatedExitFee)}</strong>
                  </div>
                  <div>
                    <span>Current Net PnL</span>
                    <strong>{money(currentNetPnl)}</strong>
                  </div>
                  <div>
                    <span>Current Equity</span>
                    <strong>{money(currentEquity)}</strong>
                  </div>
                  <div>
                    <span>Entry Fee</span>
                    <strong>{money(position.entryFee)}</strong>
                  </div>
                  <div>
                    <span>Open Time</span>
                    <strong>{date(position.entryAt)}</strong>
                  </div>
                  <div>
                    <span>Last Monitoring</span>
                    <strong>{date(position.monitoring.lastCheckedAt)}</strong>
                  </div>
                </div>

                {position.opportunitySnapshot && (
                  <div className="phase4AccountNotice">
                    <strong>Opening Opportunity Context</strong>
                    <span>
                      Score {position.opportunitySnapshot.score} / 100 ·{" "}
                      {position.opportunitySnapshot.opportunityStrength} · Risk{" "}
                      {position.opportunitySnapshot.riskLevel ?? "—"}
                    </span>
                  </div>
                )}

                {targetReached && !liquidationReached && (
                  <div className="phase4AccountNotice">
                    Target reached at the latest Bitpin price; server-side
                    closure remains authoritative.
                  </div>
                )}

                {liquidationReached && (
                  <div className="phase4Warning">
                    Liquidation boundary reached; server-side closure remains
                    authoritative.
                  </div>
                )}

                {position.monitoring.lastError && (
                  <div className="phase4Warning">
                    Monitoring retry pending: {position.monitoring.lastError}
                  </div>
                )}
              </article>
            );
          })
        ) : (
          <div className="phase3Empty">No OPEN paper positions.</div>
        )}
      </div>

      <div className="phase4History">
        <h3>Position History</h3>

        {history.length ? (
          <div className="phase3TableWrap">
            <table className="phase3Table">
              <thead>
                <tr>
                  <th>Result</th>
                  <th>Direction</th>
                  <th>Entry</th>
                  <th>Exit</th>
                  <th>Target</th>
                  <th>Liquidation</th>
                  <th>Capital</th>
                  <th>Leverage</th>
                  <th>Exposure</th>
                  <th>USDT</th>
                  <th>Gross PnL</th>
                  <th>Entry Fee</th>
                  <th>Exit Fee</th>
                  <th>Total Fees</th>
                  <th>Net PnL</th>
                  <th>Final Equity</th>
                  <th>Reason</th>
                  <th>Duration</th>
                </tr>
              </thead>
              <tbody>
                {history.map((position) => (
                  <tr key={position._id}>
                    <td>{position.result ?? "—"}</td>
                    <td>{position.direction}</td>
                    <td>{money(position.entryPrice)}</td>
                    <td>{money(position.exitPrice)}</td>
                    <td>{money(position.targetPrice)}</td>
                    <td>{money(position.liquidationPrice)}</td>
                    <td>{money(position.initialCapital)}</td>
                    <td>{position.leverage}x</td>
                    <td>{money(position.positionNotional)}</td>
                    <td>{position.usdtQuantity.toFixed(6)}</td>
                    <td>{money(position.grossPnl)}</td>
                    <td>{money(position.entryFee)}</td>
                    <td>{money(position.exitFee)}</td>
                    <td>{money(position.totalFees)}</td>
                    <td>{money(position.netPnl)}</td>
                    <td>{money(position.currentEquity)}</td>
                    <td>{position.exitReason ?? "—"}</td>
                    <td>{duration(position.entryAt, position.closedAt)}</td>
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
