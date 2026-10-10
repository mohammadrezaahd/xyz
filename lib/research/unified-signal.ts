import type { OpportunityAnalysis } from "../opportunity/types";
import type { ForecastResult, LiveForecast, ForecastHorizon } from "./forecast";
import type { TrendRegimeResult } from "./trend-regime";

export type UnifiedDirection = "BULLISH" | "BEARISH" | "NEUTRAL" | "CONFLICT" | "INSUFFICIENT_DATA";
export type UnifiedAction = "BUY_CHEAP_SELL_EXPENSIVE" | "WAIT_FOR_CONFIRMATION" | "NO_TRADE" | "INSUFFICIENT_DATA";
export type HorizonSignal = {
  horizonMinutes: ForecastHorizon;
  direction: UnifiedDirection;
  score: number | null;
  evidenceStrength: "STRONG" | "MODERATE" | "WEAK" | "CONFLICT" | "UNAVAILABLE";
  forecastScore: number | null;
  balanceScore: number | null;
  trendScore: number | null;
  conflictReasons: string[];
  explanation: string;
};
export type UnifiedSignal = {
  generatedAt: string;
  direction: UnifiedDirection;
  action: UnifiedAction;
  score: number | null;
  evidenceStrength: HorizonSignal["evidenceStrength"];
  horizons: HorizonSignal[];
  opportunityEligible: boolean;
  blockers: string[];
  summary: string;
  model: "unified-evidence-v1";
};

const HORIZONS: ForecastHorizon[] = [5, 15, 30, 60];
const weights: Record<ForecastHorizon, { forecast: number; balance: number; trend: number }> = {
  5: { forecast: 0.65, balance: 0.25, trend: 0.10 },
  15: { forecast: 0.60, balance: 0.25, trend: 0.15 },
  30: { forecast: 0.55, balance: 0.25, trend: 0.20 },
  60: { forecast: 0.45, balance: 0.25, trend: 0.30 },
};
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const sign = (value: number | null) => value == null || Math.abs(value) < 12 ? 0 : Math.sign(value);
const finite = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value);

function forecastScore(row: LiveForecast | undefined): number | null {
  if (!row || row.dataStatus !== "READY" || row.direction === "INSUFFICIENT_DATA" || !finite(row.score)) return null;
  return clamp(row.score, -100, 100);
}

function balanceScore(analysis: OpportunityAnalysis): number | null {
  const value = analysis.buySellBalance.value;
  if (!finite(value) || analysis.dataQuality.status !== "READY") return null;
  return clamp((value - 50) * 2, -100, 100);
}

function trendScore(trend: TrendRegimeResult | null): number | null {
  if (!trend || trend.dataStatus !== "READY" || !finite(trend.score) || trend.direction === "REVERSAL_WATCH" || trend.direction === "INSUFFICIENT_DATA") return null;
  return clamp(trend.score, -100, 100);
}

function buildHorizon(horizonMinutes: ForecastHorizon, forecast: LiveForecast | undefined, balance: number | null, trend: TrendRegimeResult | null): HorizonSignal {
  const f = forecastScore(forecast);
  const b = balance;
  const t = trendScore(trend);
  const available = [
    { key: "forecast" as const, value: f, weight: weights[horizonMinutes].forecast },
    { key: "balance" as const, value: b, weight: weights[horizonMinutes].balance },
    { key: "trend" as const, value: t, weight: weights[horizonMinutes].trend },
  ].filter((item): item is { key: "forecast" | "balance" | "trend"; value: number; weight: number } => item.value !== null);
  if (!available.some((item) => item.key === "forecast")) {
    return { horizonMinutes, direction: "INSUFFICIENT_DATA", score: null, evidenceStrength: "UNAVAILABLE", forecastScore: f, balanceScore: b, trendScore: t, conflictReasons: ["The horizon-specific forecast is unavailable or stale."], explanation: "No directional call: the forecast for this horizon is not ready." };
  }
  const weightTotal = available.reduce((sum, item) => sum + item.weight, 0);
  const score = clamp(available.reduce((sum, item) => sum + item.value * item.weight, 0) / weightTotal, -100, 100);
  const forecastSign = sign(f);
  const opposing = available.filter((item) => item.key !== "forecast" && sign(item.value) !== 0 && forecastSign !== 0 && sign(item.value) !== forecastSign);
  const strongConflict = opposing.some((item) => Math.abs(item.value) >= 28) && Math.abs(f ?? 0) >= 18;
  const conflictReasons: string[] = [];
  if (f !== null && b !== null && sign(f) !== 0 && sign(b) !== 0 && sign(f) !== sign(b)) conflictReasons.push("Forecast and Buy/Sell Balance disagree.");
  if (f !== null && t !== null && sign(f) !== 0 && sign(t) !== 0 && sign(f) !== sign(t)) conflictReasons.push("Short-horizon forecast and trend regime disagree.");
  if (trend?.direction === "REVERSAL_WATCH") conflictReasons.push("The trend engine reports reversal risk.");
  const direction: UnifiedDirection = strongConflict ? "CONFLICT" : score >= 18 ? "BULLISH" : score <= -18 ? "BEARISH" : "NEUTRAL";
  const magnitude = Math.abs(score);
  const evidenceStrength = strongConflict ? "CONFLICT" : magnitude >= 45 ? "STRONG" : magnitude >= 25 ? "MODERATE" : "WEAK";
  const explanation = strongConflict
    ? "Conflicting independent evidence: do not turn the directional score into a trade."
    : direction === "BULLISH" ? "Available evidence leans upward; this is directional evidence, not a calibrated probability."
    : direction === "BEARISH" ? "Available evidence leans downward; this is directional evidence, not a calibrated probability."
    : "Evidence is mixed or too weak for a directional call.";
  return { horizonMinutes, direction, score: Math.round(score), evidenceStrength, forecastScore: f, balanceScore: b, trendScore: t, conflictReasons, explanation };
}

export function buildUnifiedSignal(input: {
  opportunity: OpportunityAnalysis;
  forecast: ForecastResult | null;
  trend: TrendRegimeResult | null;
  nowMs?: number;
}): UnifiedSignal {
  const { opportunity, forecast, trend } = input;
  const nowMs = input.nowMs ?? Date.now();
  const forecastFresh = !!forecast && forecast.candleAgeSeconds !== null && forecast.candleAgeSeconds <= 180;
  const trendFresh = !!trend && trend.candleAgeSeconds !== null && trend.candleAgeSeconds <= 300;
  const usableForecast = forecastFresh ? forecast : null;
  const usableTrend = trendFresh ? trend : null;
  const balance = balanceScore(opportunity);
  const horizons = HORIZONS.map((horizon) => buildHorizon(
    horizon,
    usableForecast?.forecasts.find((row) => row.horizonMinutes === horizon),
    balance,
    usableTrend,
  ));
  const nearTerm = horizons.filter((row) => row.horizonMinutes === 5 || row.horizonMinutes === 15);
  const directional = nearTerm.filter((row) => row.direction === "BULLISH" || row.direction === "BEARISH");
  const bullish = directional.filter((row) => row.direction === "BULLISH").length;
  const bearish = directional.filter((row) => row.direction === "BEARISH").length;
  const hasConflict = nearTerm.some((row) => row.direction === "CONFLICT");
  const direction: UnifiedDirection = hasConflict || (bullish > 0 && bearish > 0)
    ? "CONFLICT"
    : bullish > bearish ? "BULLISH"
    : bearish > bullish ? "BEARISH"
    : "NEUTRAL";
  const representative = horizons.find((row) => row.horizonMinutes === 15);
  const score = representative?.score ?? null;
  const blockers: string[] = [];
  if (!usableForecast) blockers.push("Forecast data is missing or stale.");
  if (!usableTrend) blockers.push("Trend regime is missing or stale; directional evidence is incomplete.");
  if (opportunity.dataQuality.status !== "READY") blockers.push(...opportunity.dataQuality.reasons.map((reason) => `Opportunity data: ${reason}.`));
  if (!opportunity.eligibleForSignal || opportunity.decision !== "BUY_CHEAP_SELL_EXPENSIVE") blockers.push(`Opportunity gate: ${opportunity.decisionReason}`);
  if (direction === "CONFLICT") blockers.push("The 5m/15m evidence conflicts; wait for alignment.");
  if (direction === "BEARISH") blockers.push("Bearish directional evidence conflicts with the currently supported long spread route.");
  if (direction === "NEUTRAL") blockers.push("No sufficiently clear short-term direction.");
  const opportunityEligible = opportunity.eligibleForSignal && opportunity.decision === "BUY_CHEAP_SELL_EXPENSIVE" && opportunity.dataQuality.status === "READY";
  const canTrade = opportunityEligible && usableTrend?.direction !== "REVERSAL_WATCH" && direction === "BULLISH" && nearTerm.every((row) => row.direction === "BULLISH" && row.evidenceStrength !== "CONFLICT" && !row.conflictReasons.includes("The trend engine reports reversal risk."));
  const action: UnifiedAction = !usableForecast || !usableTrend ? "INSUFFICIENT_DATA" : canTrade ? "BUY_CHEAP_SELL_EXPENSIVE" : opportunityEligible ? "WAIT_FOR_CONFIRMATION" : "NO_TRADE";
  const evidenceStrength = hasConflict || direction === "CONFLICT" ? "CONFLICT" : !usableForecast ? "UNAVAILABLE" : Math.abs(score ?? 0) >= 45 ? "STRONG" : Math.abs(score ?? 0) >= 25 ? "MODERATE" : "WEAK";
  const summary = action === "BUY_CHEAP_SELL_EXPENSIVE"
    ? "Directional evidence and the economic opportunity gate align. Research signal only; verify live execution conditions."
    : action === "WAIT_FOR_CONFIRMATION"
      ? "Do not act yet. The opportunity may be economically attractive, but directional evidence is not aligned strongly enough."
      : action === "INSUFFICIENT_DATA"
        ? "No final signal: one or more required research engines are unavailable or stale."
        : "No trade: the opportunity fails one or more data, direction, target, stability, or after-cost gates.";
  return {
    generatedAt: new Date(nowMs).toISOString(),
    direction,
    action,
    score,
    evidenceStrength,
    horizons,
    opportunityEligible,
    blockers: [...new Set(blockers)],
    summary,
    model: "unified-evidence-v1",
  };
}
