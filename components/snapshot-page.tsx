"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MarketSnapshot, MarketSnapshotTrend } from "@/lib/market-snapshots/types";

const trendLabels: Record<MarketSnapshotTrend, string> = {
  STRONGLY_BULLISH: "Strongly Bullish",
  BULLISH: "Bullish",
  STABLE: "Stable",
  BEARISH: "Bearish",
  STRONGLY_BEARISH: "Strongly Bearish",
};

function formatNumber(value: number | null | undefined): string {
  return value == null ? "—" : value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}
function formatPercent(value: number | null | undefined): string {
  return value == null ? "—" : `${value.toFixed(2)}%`;
}
function snapshotCompleteness(snapshot: MarketSnapshot): number {
  return snapshot.dataCompleteness ?? snapshot.confidence ?? 0;
}
function snapshotId(snapshot: MarketSnapshot): string {
  const value = snapshot._id;
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "$oid" in value) return String((value as { $oid: string }).$oid);
  return "unknown";
}

export function SnapshotPage() {
  const [snapshots, setSnapshots] = useState<MarketSnapshot[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/snapshots?limit=100", { cache: "no-store" });
      const payload = (await response.json()) as { snapshots?: MarketSnapshot[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? `Snapshots API HTTP ${response.status}`);
      setSnapshots(payload.snapshots ?? []);
      setSelectedId((current) => current && (payload.snapshots ?? []).some((item) => snapshotId(item) === current) ? current : (payload.snapshots?.[0] ? snapshotId(payload.snapshots[0]) : null));
      setError("");
    } catch (value) {
      setError(value instanceof Error ? value.message : "Unable to load snapshots");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const selected = useMemo(() => snapshots.find((item) => snapshotId(item) === selectedId) ?? null, [snapshots, selectedId]);

  const exportJson = (items: MarketSnapshot[]) => {
    const payload = JSON.stringify(items, null, 2);
    const blob = new Blob([payload], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = items.length === 1 ? `xyz-snapshot-${snapshotId(items[0])}.json` : "xyz-snapshots.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="workspacePage">
      <div className="pageIntro">
        <div className="sectionEyebrow">MARKET SNAPSHOTS</div>
        <div className="snapshotIntroRow">
          <div>
            <h2>Point-in-time market research</h2>
            <p>Immutable captures of the complete Opportunity Analysis, including spread, stability, data completeness, net edge, validations, candle classifications, target, and scoring inputs.</p>
          </div>
          <div className="snapshotIntroActions">
            <button className="refreshButton" type="button" onClick={() => void load()} disabled={loading}>{loading ? "Updating…" : "Refresh"}</button>
            <button className="primaryButton" type="button" onClick={() => exportJson(snapshots)} disabled={snapshots.length === 0}>Export All JSON</button>
          </div>
        </div>
      </div>

      {error && <div className="errorBanner" role="alert"><strong>Snapshot error</strong><span>{error}</span></div>}

      <div className="snapshotLayout">
        <div className="snapshotList">
          <div className="snapshotListHeader"><strong>{snapshots.length} snapshots</strong><span>Newest first</span></div>
          {snapshots.length === 0 && !loading && <div className="snapshotEmpty">No snapshots have been recorded yet.</div>}
          {snapshots.map((snapshot) => {
            const id = snapshotId(snapshot);
            const active = id === selectedId;
            return (
              <button key={id} className={`snapshotListItem${active ? " isActive" : ""}`} type="button" onClick={() => setSelectedId(id)}>
                <span className={`snapshotTrend snapshotTrend--${snapshot.trend.toLowerCase()}`}>{trendLabels[snapshot.trend]}</span>
                <strong>{new Date(snapshot.createdAt).toLocaleString("en-US")}</strong>
                <small>Spread {formatPercent(snapshot.spreadPct)} · Stability {snapshot.stability.toFixed(1)} · Data completeness {snapshotCompleteness(snapshot).toFixed(0)}%</small>
              </button>
            );
          })}
        </div>

        <div className="snapshotDetail">
          {!selected && <div className="snapshotEmpty snapshotEmpty--detail">Select a snapshot to inspect its complete captured state.</div>}
          {selected && (
            <>
              <div className="snapshotDetailHeader">
                <div>
                  <div className="sectionEyebrow">SNAPSHOT {snapshotId(selected).slice(0, 8)}</div>
                  <h3>{trendLabels[selected.trend]}</h3>
                  <p>{new Date(selected.createdAt).toLocaleString("en-US")} · Version {selected.snapshotVersion}</p>
                </div>
                <button className="primaryButton" type="button" onClick={() => exportJson([selected])}>Export JSON</button>
              </div>

              <div className="snapshotMetrics">
                <div><span>Spread</span><strong>{formatPercent(selected.spreadPct)}</strong></div>
                <div><span>Stability</span><strong>{selected.stability.toFixed(1)} / 100</strong></div>
                <div><span>Data completeness</span><strong>{snapshotCompleteness(selected).toFixed(0)}%</strong></div>
                <div><span>Net edge</span><strong>{formatPercent(selected.netEdgePct)}</strong></div>
              </div>

              <div className="snapshotPayload">
                <div className="snapshotPayloadHeader">
                  <div><strong>Complete captured Opportunity Analysis</strong><span>JSON view of the persisted record</span></div>
                </div>
                <pre>{JSON.stringify(selected.analysis, null, 2)}</pre>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
