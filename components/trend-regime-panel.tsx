"use client";

import { useCallback, useEffect, useState } from "react";

type HorizonResult = {
  horizonMinutes: number;
  testSamples: number;
  directionalSignals: number;
  coveragePct: number | null;
  directionalAccuracyPct: number | null;
  meanNetReturnPerSignalPct: number | null;
  profitableSignalRatePct: number | null;
  status: "EVALUATED" | "INSUFFICIENT_SAMPLE";
};
type TrendPayload = {
  ok: boolean;
  error?: string;
  generatedAt?: string;
  dataStatus?: "READY" | "STALE_OR_GAPPED" | "INSUFFICIENT_DATA";
  synchronizedCandles?: number;
  candleAgeSeconds?: number | null;
  price?: number | null;
  direction?: "BULLISH" | "BEARISH" | "RANGE" | "REVERSAL_WATCH" | "INSUFFICIENT_DATA";
  rawDirection?: "BULLISH" | "BEARISH" | "RANGE";
  score?: number | null;
  persistenceVotes?: { bullish: number; bearish: number; range: number; window: number };
  momentum?: { return15Pct: number | null; return60Pct: number | null; return180Pct: number | null; return360Pct: number | null; volatility60Pct: number | null };
  structure?: "HIGHER_HIGHS_HIGHER_LOWS" | "LOWER_HIGHS_LOWER_LOWS" | "MIXED_OR_UNCONFIRMED";
  entryTiming?: "PULLBACK_WATCH" | "BREAKOUT_CONFIRMATION" | "CONTINUATION_WATCH" | "WAIT" | "INSUFFICIENT_DATA";
  entryReason?: string;
  regimeReason?: string;
  warning?: string;
  backtest?: { costPerRoundTripPct: number; futureDataUsedForPrediction: false; horizons: HorizonResult[] };
};

const labels: Record<NonNullable<TrendPayload["direction"]>, string> = {
  BULLISH: "روند اصلی صعودی",
  BEARISH: "روند اصلی نزولی",
  RANGE: "بازار خنثی / بدون روند",
  REVERSAL_WATCH: "هشدار احتمال تغییر روند",
  INSUFFICIENT_DATA: "دادهٔ کافی نیست",
};
const entryLabels: Record<NonNullable<TrendPayload["entryTiming"]>, string> = {
  PULLBACK_WATCH: "انتظار برای پایان اصلاح",
  BREAKOUT_CONFIRMATION: "بررسی شکست قیمت",
  CONTINUATION_WATCH: "انتظار برای ادامهٔ روند",
  WAIT: "فعلاً صبر کن",
  INSUFFICIENT_DATA: "دادهٔ کافی نیست",
};
const pct = (value: number | null | undefined, digits = 3) =>
  value == null || !Number.isFinite(value) ? "—" : `${value.toFixed(digits)}%`;
const rate = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value) ? "نمونه کافی نیست" : `${value.toFixed(1)}%`;
const number = (value: number | null | undefined, digits = 1) =>
  value == null || !Number.isFinite(value) ? "—" : value.toLocaleString("en-US", { maximumFractionDigits: digits });

export function TrendRegimePanel({ mode = "summary" }: { mode?: "summary" | "details" }) {
  const [data, setData] = useState<TrendPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const response = await fetch("/api/research/trend-regime", { cache: "no-store" });
      const payload = await response.json() as TrendPayload;
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? `Trend API HTTP ${response.status}`);
      setData(payload);
      setError("");
    } catch (value) {
      setError(value instanceof Error ? value.message : "بارگذاری تحلیل روند ناموفق بود.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const ready = data?.dataStatus === "READY";
  const direction = data?.direction ?? "INSUFFICIENT_DATA";
  const structureLabel = data?.structure === "HIGHER_HIGHS_HIGHER_LOWS"
    ? "سقف و کف‌های بالاتر"
    : data?.structure === "LOWER_HIGHS_LOWER_LOWS"
      ? "سقف و کف‌های پایین‌تر"
      : "ساختار تأییدنشده";
  const voteText = data?.persistenceVotes
    ? `تأیید در ${data.persistenceVotes.bullish} از ${data.persistenceVotes.window} بررسی صعودی، ${data.persistenceVotes.bearish} بررسی نزولی`
    : "در انتظار داده";

  return <section className="forecastWorkspace" aria-labelledby="trend-regime-title">
    <div className="forecastHero">
      <div className="forecastHeroCopy">
        <div className="sectionEyebrow">MARKET INTELLIGENCE · PHASE 1</div>
        <h2 id="trend-regime-title">روند اصلی بازار و زمان‌بندی ورود</h2>
        <p>روند ۱۵ دقیقه تا ۶ ساعت، ساختار سقف و کف و پایداری سیگنال؛ جدا از پیش‌بینی جهت کوتاه‌مدت.</p>
      </div>
      <button className="refreshButton" type="button" disabled={loading || refreshing} onClick={() => void load(true)}>
        {refreshing ? "در حال به‌روزرسانی…" : "به‌روزرسانی"}
      </button>
    </div>

    {error && <div className="errorBanner" role="alert"><strong>تحلیل روند در دسترس نیست</strong><span>{error}</span></div>}

    <section className="forecastDecision">
      <div className="forecastDecisionTop">
        <div>
          <div className="sectionEyebrow">REGIME STATUS</div>
          <h2>{loading && !data ? "در حال تحلیل تاریخچه…" : labels[direction]}</h2>
        </div>
        <span className={`forecastVerdict ${direction === "BULLISH" ? "forecastVerdict--up" : direction === "BEARISH" ? "forecastVerdict--down" : "forecastVerdict--wait"}`}>
          {ready ? "داده آماده" : data?.dataStatus === "STALE_OR_GAPPED" ? "داده کهنه / دارای شکاف" : "داده ناکافی"}
        </span>
      </div>
      <p className="forecastDecisionLead">{data?.regimeReason ?? "پس از دریافت دادهٔ هم‌زمان از Bitpin و Wallex، وضعیت روند محاسبه می‌شود."}</p>
      <p>{data?.entryReason ?? "زمان‌بندی ورود هنوز قابل محاسبه نیست."}</p>
      <small>این برچسب‌ها نتیجهٔ قواعد قابل توضیح‌اند، نه احتمال قطعی یا توصیهٔ تضمینی معامله. {data?.warning ?? ""}</small>
    </section>

    {mode === "details" && <section className="forecastMetaGrid" aria-label="شاخص‌های روند">
      <div className="forecastMeta"><span>قیمت Bitpin</span><strong>{number(data?.price, 0)}</strong></div>
      <div className="forecastMeta"><span>امتیاز جهت</span><strong>{data?.score == null ? "—" : number(data.score, 1) + " / 100"}</strong></div>
      <div className="forecastMeta"><span>کندل‌های هم‌زمان</span><strong>{data?.synchronizedCandles?.toLocaleString("en-US") ?? "—"}</strong></div>
      <div className="forecastMeta"><span>عمر آخرین کندل</span><strong>{data?.candleAgeSeconds == null ? "—" : `${data.candleAgeSeconds}s`}</strong></div>
    </section>

    <section className="forecastCards" aria-label="بازده چندبازه‌ای">
      {[
        ["بازده ۱۵ دقیقه", data?.momentum?.return15Pct],
        ["بازده ۶۰ دقیقه", data?.momentum?.return60Pct],
        ["بازده ۳ ساعت", data?.momentum?.return180Pct],
        ["بازده ۶ ساعت", data?.momentum?.return360Pct],
      ].map(([label, value]) => <article className="forecastCard" key={String(label)}>
        <div className="forecastCardTop"><span>{label}</span></div>
        <h3>{pct(typeof value === "number" ? value : null)}</h3>
      </article>)}
    </section>

    <section className="forecastDecision">
      <div className="sectionEyebrow">SIGNAL PERSISTENCE & ENTRY TIMING</div>
      <div className="forecastDecisionTop">
        <h2>{data?.entryTiming ? entryLabels[data.entryTiming] : "در انتظار داده"}</h2>
        <span className="forecastVerdict forecastVerdict--wait">{structureLabel}</span>
      </div>
      <p>{voteText}. جهت خام همین لحظه: {data?.rawDirection === "BULLISH" ? "صعودی" : data?.rawDirection === "BEARISH" ? "نزولی" : "خنثی"}.</p>
      <small>تغییر جهت با رأی‌گیری سادهٔ افق‌های ۵/۱۵/۳۰ دقیقه‌ای انجام نمی‌شود؛ روند با بازده چندبازه‌ای، ساختار بازار و پایداری در پنج بررسی اخیر ارزیابی می‌شود.</small>
    </section>

    {mode === "details" && <section className="chartSection" aria-labelledby="trend-backtest-title">
      <div className="sectionHeader">
        <div><div className="sectionEyebrow">CHRONOLOGICAL HOLDOUT</div><h2 id="trend-backtest-title">اعتبارسنجی تاریخی روند</h2></div>
        <span className="sectionNote">هزینه رفت‌وبرگشت: {pct(data?.backtest?.costPerRoundTripPct, 2)}</span>
      </div>
      <div style={{ overflowX: "auto", padding: "0 16px 16px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700, textAlign: "left" }}>
          <thead><tr>{["افق", "نمونهٔ آزمون", "سیگنال روند", "پوشش", "درستی جهت", "میانگین خالص هر سیگنال", "وضعیت"].map((label) => <th key={label} style={{ padding: 10, color: "var(--color-text-muted)", borderBottom: "1px solid var(--color-border)", fontSize: 11 }}>{label}</th>)}</tr></thead>
          <tbody>{(data?.backtest?.horizons ?? []).map((item) => <tr key={item.horizonMinutes}>
            <td style={{ padding: 10, borderBottom: "1px solid var(--color-border)" }}>{item.horizonMinutes} دقیقه</td>
            <td style={{ padding: 10, borderBottom: "1px solid var(--color-border)" }}>{item.testSamples.toLocaleString("en-US")}</td>
            <td style={{ padding: 10, borderBottom: "1px solid var(--color-border)" }}>{item.directionalSignals.toLocaleString("en-US")}</td>
            <td style={{ padding: 10, borderBottom: "1px solid var(--color-border)" }}>{rate(item.coveragePct)}</td>
            <td style={{ padding: 10, borderBottom: "1px solid var(--color-border)" }}>{rate(item.directionalAccuracyPct)}</td>
            <td style={{ padding: 10, borderBottom: "1px solid var(--color-border)" }}>{pct(item.meanNetReturnPerSignalPct, 4)}</td>
            <td style={{ padding: 10, borderBottom: "1px solid var(--color-border)", color: item.status === "EVALUATED" ? "var(--color-positive)" : "var(--color-warning)" }}>{item.status === "EVALUATED" ? "نمونه کافی" : "نمونه ناکافی"}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <p style={{ padding: "0 20px", color: "var(--color-text-muted)", fontSize: 11, lineHeight: 1.7 }}>
        آزمون فقط ۲۰٪ پایانی تاریخچه را می‌سنجد و هر پیش‌بینی تنها از کندل‌های قبلی استفاده می‌کند. نمونه‌ها هم‌پوشانی دارند؛ «میانگین خالص هر سیگنال» بازده مرکب سرمایه نیست. برای نتیجه‌گیری قابل اتکا، آزمون باید روی چندین دوره و وضعیت بازار تکرار شود.
      </p>
    </section>}
  </section>;
}
