"use client";

import { useEffect, useState } from "react";
import {
  TEST_POSITION_DEFAULT_LEVERAGE,
  TEST_POSITION_INITIAL_CAPITAL,
} from "@/lib/test-position/types";

type TestResult = { status: string };
type Opportunity = {
  _id?: { $oid?: string } | string;
  status: "OPEN" | "SUCCESS" | "FAILED" | "INVALIDATED";
  direction: "SHORT";
  entry: { price: number };
  target?: { price: number; source: "phase-2-safe-target" };
  market: { bitpinPrice: number; wallexPrice: number; spreadPct: number };
  analysis: { score: number; tests: Record<string, TestResult> };
  outcome: {
    resolvedAt: string | null;
    exitPrice: number | null;
    priceChangePct: number | null;
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
  resolved: number;
  successRate: number | null;
};

function formatPrice(value: number | null) {
  return value === null ? "—" : value.toLocaleString("en-US");
}
function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}
function statusClass(status: string) {
  return `phase3Status ${status.toLowerCase()}`;
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

export function Phase3Panel({
  onStartTest,
}: {
  onStartTest?: (opportunityId: string, initialCapital: number, leverage: number) => void;
}) {
  const [open, setOpen] = useState<Opportunity | null>(null);
  const [recent, setRecent] = useState<Opportunity[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  const [testCapital, setTestCapital] = useState(TEST_POSITION_INITIAL_CAPITAL);
  const [testLeverage, setTestLeverage] = useState(TEST_POSITION_DEFAULT_LEVERAGE);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/opportunities", { cache: "no-store" });
        const data = (await response.json()) as {
          open?: Opportunity | null;
          recent?: Opportunity[];
          stats?: Stats;
          error?: string;
        };

        if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
        if (cancelled) return;

        setOpen(data.open ?? null);
        setRecent(data.recent ?? []);
        setStats(data.stats ?? null);
        setError("");
      } catch (value) {
        if (!cancelled) {
          setError(value instanceof Error ? value.message : "Unable to load Phase 3");
        }
      }
    }

    load();
    const timer = window.setInterval(load, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <section className="phase3 card">
      <div className="opportunityHeader">
        <div>
          <div className="exchange">Synthetic Opportunities</div>
          <div className="symbol">Persistent Phase 3 tracking · no real trading</div>
        </div>
      </div>

      <div className="phase3Current">
        <h3>Current Test Position</h3>
        {open ? (
          <>
            <div className="phase3PositionGrid">
              <div><span>Status</span><strong className={statusClass(open.status)}>{open.status}</strong></div>
              <div><span>Direction</span><strong>{open.direction}</strong></div>
              <div><span>Entry</span><strong>{formatPrice(open.entry.price)}</strong></div>
              <div><span>Safe Target</span><strong>{formatPrice(open.target?.price ?? null)}</strong></div>
              <div><span>Current Bitpin</span><strong>{formatPrice(open.monitoring.currentBitpinPrice)}</strong></div>
              <div><span>Current Change</span><strong>{
                open.monitoring.currentBitpinPrice === null
                  ? "—"
                  : `${((open.monitoring.currentBitpinPrice - open.entry.price) / open.entry.price * 100).toFixed(3)}%`
              }</strong></div>
              <div><span>Spread at Detection</span><strong>{open.market.spreadPct.toFixed(2)}%</strong></div>
              <div><span>Score</span><strong>{open.analysis.score.toFixed(1)}</strong></div>
              <div><span>Detected</span><strong>{formatDate(open.detection.detectedAt)}</strong></div>
            </div>
            <div className="phase3Tests">
              {Object.entries(open.analysis.tests).map(([key, test]) => (
                <span key={key} className={statusClass(test.status)}>
                  {testLabels[key] ?? key}: {test.status}
                </span>
              ))}
            </div>
            {onStartTest && typeof open._id === "string" && (
              <div className="phase4StartRow">
                <div>
                  <strong>Test this Phase 3 opportunity</strong>
                  <span>Entry will be fetched from the current Bitpin ticker.</span>
                </div>
                <label className="phase4Input">
                  <span>Capital</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={testCapital}
                    onChange={(event) => setTestCapital(Number(event.target.value))}
                  />
                </label>
                <label className="phase4Input">
                  <span>Leverage</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={testLeverage}
                    onChange={(event) => setTestLeverage(Number(event.target.value))}
                  />
                </label>
                <button
                  className="phase4StartButton"
                  type="button"
                  disabled={!Number.isFinite(testCapital) || testCapital <= 0 || !Number.isFinite(testLeverage) || testLeverage <= 0}
                  onClick={() => onStartTest(open._id as string, testCapital, testLeverage)}
                >
                  Start Test
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="phase3Empty">No OPEN synthetic position.</div>
        )}
      </div>

      {stats && (
        <div className="phase3Stats">
          <div><span>Total</span><strong>{stats.total}</strong></div>
          <div><span>Open</span><strong>{stats.open}</strong></div>
          <div><span>Success</span><strong>{stats.successful}</strong></div>
          <div><span>Failed</span><strong>{stats.failed}</strong></div>
          <div><span>Invalidated</span><strong>{stats.invalidated}</strong></div>
          <div><span>Resolved</span><strong>{stats.resolved}</strong></div>
          <div><span>Success Rate</span><strong>{stats.successRate === null ? "—" : `${(stats.successRate * 100).toFixed(1)}%`}</strong></div>
        </div>
      )}

      <div className="phase3History">
        <h3>History</h3>
        {recent.length > 0 ? (
          <div className="phase3TableWrap">
            <table className="phase3Table">
              <thead>
                <tr>
                  <th>Status</th><th>Entry</th><th>Target</th><th>Exit</th>
                  <th>Spread</th><th>Score</th><th>Detected</th><th>Resolved</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((item, index) => (
                  <tr key={typeof item._id === "string" ? item._id : item._id?.$oid ?? index}>
                    <td><span className={statusClass(item.status)}>{item.status}</span></td>
                    <td>{formatPrice(item.entry.price)}</td>
                    <td>{formatPrice(item.target?.price ?? null)}</td>
                    <td>{formatPrice(item.outcome.exitPrice)}</td>
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

      {error && <div className="error">{error}</div>}
    </section>
  );
}
