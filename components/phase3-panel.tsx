"use client";

import { useEffect, useState } from "react";

type TestResult = { status: string };

type Opportunity = {
  _id?: { $oid?: string } | string;
  status: "OPEN" | "SUCCESS" | "FAILED" | "INVALIDATED" | "CLOSED";
  direction: "LONG" | "SHORT";
  entry: { price: number };
  target?: { price: number; source: "phase-2-safe-target" };
  simulation?: {
    marginToman: number;
    borrowedToman: number;
    notionalToman: number;
    leverage: number;
    effectiveLeverage: number;
    quantity: number;
    takerFeePct: number;
    entryFeeToman: number;
    maintenanceMarginPct: number;
    liquidationPrice: number;
    breakEvenPrice: number;
    strategyTargetPrice: number;
    targetPrice: number;
  };
  market: { bitpinPrice: number; wallexPrice: number; spreadPct: number };
  analysis: { score: number; tests: Record<string, TestResult> };
  outcome: {
    resolvedAt: string | null;
    exitPrice: number | null;
    priceChangePct: number | null;
    grossPnlToman?: number | null;
    totalFeesToman?: number | null;
    netPnlToman?: number | null;
    netPnlPct?: number | null;
  };
  detection: { detectedAt: string };
  monitoring: { currentBitpinPrice: number | null; updatedAt: string };
};

type Stats = {
  total: number;
  open: number;
  successful: number;
  failed: number;
  invalidated: number;
  closed: number;
  resolved: number;
  successRate: number | null;
};

function formatPrice(value: number | null) {
  return value === null ? "—" : value.toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
}

function formatToman(value: number | null | undefined) {
  return value == null ? "—" : value.toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

function statusClass(status: string) {
  return `phase3Status ${status.toLowerCase()}`;
}

function getId(opportunity: Opportunity) {
  return typeof opportunity._id === "string"
    ? opportunity._id
    : opportunity._id?.$oid ?? "";
}

const testLabels: Record<string, string> = {
  externalValidation: "External",
  wallexAboveBitpin: "Wallex > Bitpin",
  spreadThreshold: "Spread",
  bitpinBullishRatio: "Bitpin Bullish",
  wallexBullishRatio: "Wallex Bullish",
  candleAlignment: "Alignment",
  targetViability: "Target",
};

export function Phase3Panel() {
  const [open, setOpen] = useState<Opportunity | null>(null);
  const [recent, setRecent] = useState<Opportunity[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  const [closing, setClosing] = useState(false);

  async function load() {
    try {
      const response = await fetch("/api/opportunities", {
        cache: "no-store",
      });
      const data = (await response.json()) as {
        open?: Opportunity | null;
        recent?: Opportunity[];
        stats?: Stats;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? `HTTP ${response.status}`);
      }

      setOpen(data.open ?? null);
      setRecent(data.recent ?? []);
      setStats(data.stats ?? null);
      setError("");
    } catch (value) {
      setError(
        value instanceof Error ? value.message : "Unable to load Phase 3",
      );
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadSafe() {
      if (cancelled) return;
      await load();
    }

    loadSafe();
    const timer = window.setInterval(loadSafe, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  async function handleManualClose() {
    if (!open) return;

    const confirmed = window.confirm(
      "Close the current simulated position at the latest Bitpin price?",
    );
    if (!confirmed) return;

    setClosing(true);
    setError("");

    try {
      const response = await fetch(
        `/api/opportunities/${getId(open)}/close`,
        { method: "POST" },
      );
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? `HTTP ${response.status}`);
      }

      await load();
    } catch (value) {
      setError(
        value instanceof Error ? value.message : "Unable to close position",
      );
    } finally {
      setClosing(false);
    }
  }

  const simulation = open?.simulation;

  return (
    <section className="phase3 card">
      <div className="opportunityHeader">
        <div>
          <div className="exchange">Leveraged Synthetic Position</div>
          <div className="symbol">
            1M margin + 10M borrowed · fee-aware LONG simulation
          </div>
        </div>
      </div>

      <div className="phase3History">
        <h3>History</h3>
        {recent.length > 0 ? (
          <div className="phase3TableWrap">
            <table className="phase3Table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Entry</th>
                  <th>Target</th>
                  <th>Liq.</th>
                  <th>Exit</th>
                  <th>Net P&amp;L</th>
                  <th>Spread</th>
                  <th>Score</th>
                  <th>Detected</th>
                  <th>Resolved</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((item, index) => (
                  <tr
                    key={
                      typeof item._id === "string"
                        ? item._id
                        : item._id?.$oid ?? index
                    }
                  >
                    <td>
                      <span className={statusClass(item.status)}>
                        {item.status}
                      </span>
                    </td>
                    <td>{formatPrice(item.entry.price)}</td>
                    <td>{formatPrice(item.simulation?.targetPrice ?? item.target?.price ?? null)}</td>
                    <td>{formatPrice(item.simulation?.liquidationPrice ?? null)}</td>
                    <td>{formatPrice(item.outcome.exitPrice)}</td>
                    <td>
                      {item.outcome.netPnlToman == null
                        ? "—"
                        : `${formatToman(item.outcome.netPnlToman)} (${item.outcome.netPnlPct?.toFixed(2) ?? "—"}%)`}
                    </td>
                    <td>{item.market.spreadPct.toFixed(2)}%</td>
                    <td>{item.analysis.score.toFixed(1)}</td>
                    <td>{formatDate(item.detection.detectedAt)}</td>
                    <td>{formatDate(item.outcome.resolvedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="phase3Empty">No persisted opportunities yet.</div>
        )}
      </div>

      {stats && (
        <div className="phase3Stats">
          <div><span>Total</span><strong>{stats.total}</strong></div>
          <div><span>Open</span><strong>{stats.open}</strong></div>
          <div><span>Success</span><strong>{stats.successful}</strong></div>
          <div><span>Failed</span><strong>{stats.failed}</strong></div>
          <div><span>Closed</span><strong>{stats.closed}</strong></div>
          <div><span>Invalidated</span><strong>{stats.invalidated}</strong></div>
          <div><span>Resolved</span><strong>{stats.resolved}</strong></div>
          <div>
            <span>Success Rate</span>
            <strong>
              {stats.successRate === null
                ? "—"
                : `${(stats.successRate * 100).toFixed(1)}%`}
            </strong>
          </div>
        </div>
      )}

      <details className="positionAccordion">
        <summary>
          <span>Current Test Position</span>
          <span className="positionSummaryStatus">
            {open ? (
              <>
                <strong className={statusClass(open.status)}>{open.status}</strong>
                <span>{formatPrice(open.entry.price)} entry</span>
              </>
            ) : (
              <span>No OPEN position</span>
            )}
          </span>
        </summary>
        <div className="positionAccordionBody">
          <div className="positionAccordionHint">
            Live position details are kept separate from historical outcomes. Expand only when you need the active simulation metrics.
          </div>
      <div className="phase3Current">
        <h3>Current Test Position</h3>
        {open ? (
          <>
            <div className="phase3PositionGrid">
              <div>
                <span>Status</span>
                <strong className={statusClass(open.status)}>
                  {open.status}
                </strong>
              </div>
              <div>
                <span>Direction</span>
                <strong>{open.direction === "SHORT" ? "LONG" : open.direction}</strong>
              </div>
              <div>
                <span>Entry</span>
                <strong>{formatPrice(open.entry.price)}</strong>
              </div>
              <div>
                <span>Simulation Target</span>
                <strong>{formatPrice(simulation?.targetPrice ?? null)}</strong>
              </div>
              <div>
                <span>Liquidation</span>
                <strong>{formatPrice(simulation?.liquidationPrice ?? null)}</strong>
              </div>
              <div>
                <span>Break-even</span>
                <strong>{formatPrice(simulation?.breakEvenPrice ?? null)}</strong>
              </div>
              <div>
                <span>Current Bitpin</span>
                <strong>{formatPrice(open.monitoring.currentBitpinPrice)}</strong>
              </div>
              <div>
                <span>Current Change</span>
                <strong>
                  {open.monitoring.currentBitpinPrice === null
                    ? "—"
                    : `${(
                        ((open.monitoring.currentBitpinPrice - open.entry.price) /
                          open.entry.price) *
                        100
                      ).toFixed(3)}%`}
                </strong>
              </div>
              <div>
                <span>Margin</span>
                <strong>{formatToman(simulation?.marginToman)}</strong>
              </div>
              <div>
                <span>Position Size</span>
                <strong>{formatToman(simulation?.notionalToman)}</strong>
              </div>
              <div>
                <span>Entry Fee</span>
                <strong>{formatToman(simulation?.entryFeeToman)}</strong>
              </div>
              <div>
                <span>Leverage</span>
                <strong>
                  {simulation
                    ? `${simulation.leverage}x · ${simulation.effectiveLeverage.toFixed(1)}x exposure`
                    : "—"}
                </strong>
              </div>
              <div>
                <span>Spread at Detection</span>
                <strong>{open.market.spreadPct.toFixed(2)}%</strong>
              </div>
              <div>
                <span>Score</span>
                <strong>{open.analysis.score.toFixed(1)}</strong>
              </div>
              <div>
                <span>Detected</span>
                <strong>{formatDate(open.detection.detectedAt)}</strong>
              </div>
            </div>

            <div className="phase3Pnl">
              <div>
                <span>Round-trip Fees</span>
                <strong>{formatToman(open.outcome.totalFeesToman)}</strong>
              </div>
              <div>
                <span>Net P&amp;L</span>
                <strong>
                  {open.outcome.netPnlToman == null
                    ? "Live / unrealized"
                    : `${formatToman(open.outcome.netPnlToman)} Toman (${open.outcome.netPnlPct?.toFixed(2) ?? "—"}%)`}
                </strong>
              </div>
            </div>

            {open.status === "OPEN" && (
              <button
                type="button"
                className="phase3CloseButton"
                onClick={handleManualClose}
                disabled={closing}
              >
                {closing ? "Closing…" : "Close Position Manually"}
              </button>
            )}

            <div className="phase3Tests">
              {Object.entries(open.analysis.tests).map(([key, test]) => (
                <span key={key} className={statusClass(test.status)}>
                  {testLabels[key] ?? key}: {test.status}
                </span>
              ))}
            </div>
          </>
        ) : (
          <div className="phase3Empty">No OPEN synthetic position.</div>
        )}
      </div>

        </div>
      </details>

      {error && <div className="error">{error}</div>}
    </section>
  );
}
