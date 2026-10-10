"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { PHASE_2_CONFIG } from "@/lib/opportunity/config";
import { BuySellBalance } from "@/components/buy-sell-balance";
import type { OpportunityAnalysis, TestResult } from "@/lib/opportunity/types";

type OpportunityPanelProps = {
  analysis: OpportunityAnalysis;
  externalPrice: string;
  onExternalPriceChange: (value: string) => void;
};

type StabilityTestKey =
  | "external"
  | "wallexAboveBitpin"
  | "spread"
  | "bitpinBullish"
  | "wallexBullish"
  | "candleAlignment"
  | "targetViability";

type TestRowProps = {
  id: StabilityTestKey;
  label: string;
  result: TestResult;
  explanation: string;
  formatActual?: (value: number) => string;
  formatThreshold?: (value: number) => string;
  openTest: StabilityTestKey | null;
  setOpenTest: (id: StabilityTestKey | null) => void;
};

function formatPrice(value: number | null): string {
  return value === null
    ? "—"
    : value.toLocaleString("en-US", {
        maximumFractionDigits: 2,
      });
}

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(2)}%`;
}

function formatRatio(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function formatSignedPrice(value: number): string {
  return `${value >= 0 ? "+" : ""}${formatPrice(value)}`;
}

function testClass(status: TestResult["status"]): string {
  return `testStatus ${status.toLowerCase()}`;
}

function getTestExplanation(
  id: StabilityTestKey,
  result: TestResult,
  lookback: number,
): string {
  if (result.status === "INSUFFICIENT_DATA") {
    switch (id) {
      case "external":
        return "No external reference price is available, so this test cannot be evaluated.";
      case "wallexAboveBitpin":
        return "One or both current ticker prices are unavailable.";
      case "spread":
        return "Current Bitpin/Wallex ticker data is insufficient to calculate the spread.";
      case "bitpinBullish":
      case "wallexBullish":
        return `Fewer than ${lookback} synchronized closed candles are available.`;
      case "candleAlignment":
        return `Fewer than ${lookback} synchronized closed candle pairs are available.`;
      case "targetViability":
        return "Current ticker prices are insufficient to evaluate target viability.";
    }
  }

  switch (id) {
    case "external":
      return result.status === "SUCCESS"
        ? `Actual deviation is ${result.actual!.toFixed(2)}%, which is within the maximum allowed ${result.threshold!.toFixed(2)}%.`
        : `Actual deviation is ${result.actual!.toFixed(2)}%, which exceeds the maximum allowed ${result.threshold!.toFixed(2)}%.`;

    case "wallexAboveBitpin":
      return result.status === "SUCCESS"
        ? `Wallex is currently ${formatPrice(result.actual!)} Toman above Bitpin.`
        : "Wallex is not above Bitpin, so the required price relationship is not satisfied.";

    case "spread": {
      const acceptableThreshold = PHASE_2_CONFIG.spreadTriggerPct * 0.5;

      if (result.status === "SUCCESS") {
        return `Current spread is ${result.actual!.toFixed(2)}%, meeting the required SUCCESS threshold of ${result.threshold!.toFixed(2)}%.`;
      }

      if (result.status === "ACCEPTABLE") {
        return `Current spread is ${result.actual!.toFixed(2)}%. This is above the minimum acceptable ${acceptableThreshold.toFixed(2)}% level but below the SUCCESS threshold of ${result.threshold!.toFixed(2)}%.`;
      }

      return `Current spread is ${result.actual!.toFixed(2)}%, below the minimum acceptable ${acceptableThreshold.toFixed(2)}% level.`;
    }

    case "bitpinBullish":
    case "wallexBullish": {
      const exchange = id === "bitpinBullish" ? "Bitpin" : "Wallex";
      const actual = result.actual!;

      if (result.status === "SUCCESS") {
        return `${formatRatio(actual)} of the last ${lookback} synchronized closed ${exchange} candles were bullish, meeting the SUCCESS threshold of ${formatRatio(result.threshold!)}.`;
      }

      if (result.status === "ACCEPTABLE") {
        return `${formatRatio(actual)} were bullish. This is above the minimum acceptable 50% level but below the SUCCESS threshold.`;
      }

      return `${formatRatio(actual)} were bullish, below the minimum acceptable 50% level.`;
    }

    case "candleAlignment": {
      const actual = result.actual!;

      if (result.status === "SUCCESS") {
        return `${formatRatio(actual)} of the last ${lookback} synchronized closed candle pairs moved in the same direction, meeting the SUCCESS threshold of ${formatRatio(result.threshold!)}.`;
      }

      if (result.status === "ACCEPTABLE") {
        return `${formatRatio(actual)} of candle pairs were aligned. This is acceptable but below the SUCCESS threshold.`;
      }

      return `${formatRatio(actual)} of candle pairs were aligned, below the minimum acceptable 50% level.`;
    }

    case "targetViability":
      return result.status === "SUCCESS"
        ? `Estimated net edge is ${result.actual!.toFixed(2)}%, which is above the required break-even threshold of 0%.`
        : `Estimated net edge is ${result.actual!.toFixed(2)}%, so the target does not provide a positive net edge after the configured fees.`;
  }
}

function TestRow({
  id,
  label,
  result,
  explanation,
  formatActual,
  formatThreshold,
  openTest,
  setOpenTest,
}: TestRowProps) {
  const pointerType = useRef<string | null>(null);
  const isOpen = openTest === id;

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    pointerType.current = event.pointerType;
  };

  const handleClick = () => {
    if (pointerType.current === "touch") {
      setOpenTest(isOpen ? null : id);
      return;
    }

    setOpenTest(id);
  };

  return (
    <div
      className={`testRowWrap${isOpen ? " isOpen" : ""}`}
      onMouseEnter={() => setOpenTest(id)}
      onMouseLeave={() => setOpenTest(null)}
    >
      <button
        className="testRow"
        type="button"
        aria-expanded={isOpen}
        aria-label={`${label}: ${result.status}. Show test details`}
        title={`Inspect ${label}`}
        onPointerDown={handlePointerDown}
        onClick={handleClick}
        onFocus={() => setOpenTest(id)}
      >
        <span>{label}</span>
        <span className={testClass(result.status)}>
          {result.status}
        </span>
      </button>

      <div className="testPopover" role="status">
        <div className="testPopoverHeader">
          <strong>{result.status}</strong>
        </div>

        {(result.actual !== null || result.threshold !== null) && (
          <div className="testPopoverMetrics">
            {result.actual !== null && (
              <span>
                Actual: {formatActual ? formatActual(result.actual) : result.actual.toFixed(2)}
              </span>
            )}
            {result.threshold !== null && (
              <span>
                Required: {formatThreshold ? formatThreshold(result.threshold) : result.threshold.toFixed(2)}
              </span>
            )}
          </div>
        )}

        <p>{explanation}</p>
      </div>
    </div>
  );
}

export function OpportunityPanel({
  analysis,
  externalPrice,
  onExternalPriceChange,
}: OpportunityPanelProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [openTest, setOpenTest] = useState<StabilityTestKey | null>(null);
  const testsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openTest) return;

    const handleOutsidePointerDown = (event: PointerEvent) => {
      if (
        testsRef.current &&
        !testsRef.current.contains(event.target as Node)
      ) {
        setOpenTest(null);
      }
    };

    document.addEventListener("pointerdown", handleOutsidePointerDown);
    return () =>
      document.removeEventListener("pointerdown", handleOutsidePointerDown);
  }, [openTest]);

  const testRows = [
    {
      id: "external" as const,
      label: "External Wallex Validation",
      result: analysis.validation.external,
    },
    {
      id: "wallexAboveBitpin" as const,
      label: "Wallex > Bitpin",
      result: analysis.validation.wallexAboveBitpin,
    },
    {
      id: "spread" as const,
      label: "Spread Threshold",
      result: analysis.validation.spread,
    },
    {
      id: "bitpinBullish" as const,
      label: "Bitpin Bullish Ratio",
      result: analysis.validation.bitpinBullish,
    },
    {
      id: "wallexBullish" as const,
      label: "Wallex Bullish Ratio",
      result: analysis.validation.wallexBullish,
    },
    {
      id: "candleAlignment" as const,
      label: "Candle Alignment",
      result: analysis.validation.candleAlignment,
    },
    {
      id: "targetViability" as const,
      label: "Target Viability",
      result: analysis.validation.targetViability,
    },
  ];

  return (
    <section className="opportunity card">
      <div className="opportunityHeader">
        <div>
          <div className="exchange">
            Opportunity / Stability
          </div>
          <div className="symbol">
            Historical validation · research evidence only
          </div>
        </div>
        <div className="resultBadges">
          <span className="scoreBadge">
            {analysis.stabilityScore.toFixed(1)} / 100
          </span>
          <span className="levelBadge">
            {analysis.opportunity}
          </span>
          <span className="riskBadge">
            {analysis.riskLevel}
          </span>
        </div>
      </div>

      <BuySellBalance candles={analysis.candles} balance={analysis.buySellBalance} dataCompleteness={analysis.dataCompleteness} dataQuality={analysis.dataQuality} synchronizedCandlePairs={analysis.candles.synchronized} minimumRequiredCandlePairs={analysis.minimumRequiredCandlePairs} netEdgePct={analysis.edge.executionNetPct} decision={analysis.decision} decisionReason={analysis.decisionReason} />

      
<div className="opportunityGrid">
        <div className="opportunityGroup">
          <h3>Current Prices</h3>
          <label className="inputField">
            <span>External Tether Price</span>
            <input
              inputMode="decimal"
              type="text"
              value={externalPrice}
              onChange={(event) =>
                onExternalPriceChange(event.target.value)
              }
              placeholder="Wallex ticker"
            />
          </label>
          <div className="metric">
            <span>Wallex · Ticker</span>
            <strong>{formatPrice(analysis.prices.wallex)}</strong>
          </div>
          <div className="metric">
            <span>Bitpin · Ticker</span>
            <strong>{formatPrice(analysis.prices.bitpin)}</strong>
          </div>
        </div>

        <div className="opportunityGroup">
          <h3>Spread</h3>
          <div className="metric">
            <span>Spread</span>
            <strong>{formatPrice(analysis.spread.absolute)}</strong>
          </div>
          <div className="metric">
            <span>Spread %</span>
            <strong>{formatPercent(analysis.spread.percent)}</strong>
          </div>
        </div>

        <div className="opportunityGroup tests" ref={testsRef}>
          <h3>Stability Tests</h3>
          <div className="candleDiagnostics"><div>Bitpin candles received: <b>{analysis.candles.bitpinReceived}</b></div><div>Wallex candles received: <b>{analysis.candles.wallexReceived}</b></div><div>Synchronized closed pairs: <b>{analysis.candles.synchronizedAvailable}</b></div><div>Pairs used for analysis: <b>{analysis.candles.synchronizedUsed}</b></div><div>Minimum required: <b>{analysis.minimumRequiredCandlePairs}</b></div><p>Directional evidence requires at least {analysis.minimumRequiredCandlePairs} synchronized closed candle pairs.</p><strong>{analysis.candles.synchronizedAvailable} of {analysis.minimumRequiredCandlePairs} required pairs available</strong></div>
          {testRows.map((test) => (
            <TestRow
              key={test.id}
              id={test.id}
              label={test.label}
              result={test.result}
              explanation={getTestExplanation(
                test.id,
                test.result,
                analysis.candles.lookback,
              )}
              formatActual={
                test.id === "external" ||
                test.id === "spread"
                  ? formatPercent
                  : test.id === "wallexAboveBitpin"
                    ? formatSignedPrice
                    : test.id === "bitpinBullish" ||
                        test.id === "wallexBullish" ||
                        test.id === "candleAlignment"
                      ? formatRatio
                      : formatPercent
              }
              formatThreshold={
                test.id === "external" || test.id === "spread"
                  ? formatPercent
                  : test.id === "wallexAboveBitpin"
                    ? formatSignedPrice
                    : test.id === "bitpinBullish" ||
                        test.id === "wallexBullish" ||
                        test.id === "candleAlignment"
                      ? formatRatio
                      : formatPercent
              }
              openTest={openTest}
              setOpenTest={setOpenTest}
            />
          ))}
        </div>

        <div className="opportunityGroup">
          <h3>Candle Statistics</h3>
          <div className="metric">
            <span>Directional evidence window</span>
            <strong>{analysis.candles.lookback} pairs</strong>
          </div>
          <div className="metric">
            <span>Directional pairs available / required</span>
            <strong>{analysis.candles.synchronized} / {analysis.minimumRequiredCandlePairs}</strong>
          </div>
          <div className="metric">
            <span>Stability Score window</span>
            <strong>{analysis.candles.stabilityLookback} synchronized pairs</strong>
          </div>
          <div className="metric">
            <span>Bitpin Bullish</span>
            <strong>
              {formatPercent(
                analysis.candles.bitpinBullishRatio === null
                  ? null
                  : analysis.candles.bitpinBullishRatio * 100,
              )}
            </strong>
          </div>
          <div className="metric">
            <span>Wallex Bullish</span>
            <strong>
              {formatPercent(
                analysis.candles.wallexBullishRatio === null
                  ? null
                  : analysis.candles.wallexBullishRatio * 100,
              )}
            </strong>
          </div>
          <div className="metric">
            <span>Alignment</span>
            <strong>
              {formatPercent(
                analysis.candles.alignmentRatio === null
                  ? null
                  : analysis.candles.alignmentRatio * 100,
              )}
            </strong>
          </div>
          <div className="metric">
            <span>Avg. Directional Move</span>
            <strong>
              {formatPercent(
                analysis.candles.averageDirectionalMovePct,
              )}
            </strong>
          </div>
          <div className="metric">
            <span>Momentum Score</span>
            <strong>
              {analysis.candles.momentumScore === null
                ? "—"
                : `${analysis.candles.momentumScore.toFixed(2)} / 5`}
            </strong>
          </div>
          <div className="metric">
            <span>Stability candles evaluated</span>
            <strong>{analysis.candles.stabilitySelected.length} / {analysis.candles.stabilityLookback}</strong>
          </div>
          <details>
            <summary>Inspect stability-window candle classification</summary>
            <div>
              {analysis.candles.stabilitySelected.map((pair) => (
                <div key={pair.timestamp}>
                  <strong>{new Date(pair.timestamp * 1000).toLocaleTimeString("en-US")}</strong>
                  <span> · Bitpin {pair.bitpin.direction} ({pair.bitpin.movementPct.toFixed(3)}%)</span>
                  <span> · Wallex {pair.wallex.direction} ({pair.wallex.movementPct.toFixed(3)}%)</span>
                </div>
              ))}
            </div>
          </details>
          <details>
            <summary>Inspect directional-evidence candle window ({analysis.candles.selected.length} pairs)</summary>
            <div>
              {analysis.candles.selected.map((pair) => (
                <div key={pair.timestamp}>
                  <strong>{new Date(pair.timestamp * 1000).toLocaleTimeString("en-US")}</strong>
                  <span> · Bitpin {pair.bitpin.direction} ({pair.bitpin.movementPct.toFixed(3)}%)</span>
                  <span> · Wallex {pair.wallex.direction} ({pair.wallex.movementPct.toFixed(3)}%)</span>
                </div>
              ))}
            </div>
          </details>
        </div>

        <div className="opportunityGroup">
          <h3>Target</h3>
          <div className="metric">
            <span>Entry · Bitpin Ticker</span>
            <strong>
              {formatPrice(analysis.target.entryPrice)}
            </strong>
          </div>
          <div className="metric">
            <span>Fee-adjusted Target · Wallex Ticker</span>
            <strong>
              {formatPrice(analysis.target.safeTarget)}
            </strong>
          </div>
          <div className="metric">
            <span>Safety Margin</span>
            <strong>
              {formatPercent(analysis.target.safetyMarginPct)}
            </strong>
          </div>
          <div className="metric">
            <span>Target Horizon</span>
            <strong>
              {analysis.target.horizonMinutes} min
            </strong>
          </div>
        </div>

        <div className="opportunityGroup">
          <h3>Edge</h3>
          <div className="metric">
            <span>Gross Edge</span>
            <strong>{formatPrice(analysis.edge.gross)}</strong>
          </div>
          <div className="metric">
            <span>Gross Edge %</span>
            <strong>{formatPercent(analysis.edge.grossPct)}</strong>
          </div>
          <div className="metric">
            <span>Fees %</span>
            <strong>{formatPercent(analysis.edge.feesPct)}</strong>
          </div>
          <div className="metric">
            <span>Net Edge %</span>
            <strong>{formatPercent(analysis.edge.netPct)}</strong>
          </div>
        </div>

        <div className="opportunityGroup">
          <h3>Score Quality</h3>
          <div className="metric">
            <span>Data Completeness</span>
            <strong>
              {analysis.dataCompleteness.toFixed(0)}%
            </strong>
          </div>
          <div className="metric">
            <span>Scoring Model</span>
            <strong>
              Available-weight
            </strong>
          </div>
        </div>
      </div>

      <button
        className="detailsButton"
        type="button"
        onClick={() => setShowDetails((value) => !value)}
      >
        {showDetails ? "Hide" : "Show"} thresholds
      </button>

      {showDetails && (
        <div className="thresholds">
          External ≤ {PHASE_2_CONFIG.externalValidationPct.toFixed(2)}%
          · Spread ≥ {PHASE_2_CONFIG.spreadTriggerPct.toFixed(2)}%
          · Bullish ≥ {(PHASE_2_CONFIG.minBullishRatio * 100).toFixed(0)}%
          · Alignment ≥ {(PHASE_2_CONFIG.minAlignmentRatio * 100).toFixed(0)}%
          · Candle move ≥ {PHASE_2_CONFIG.minCandleMovePct.toFixed(2)}%
          · Momentum reference {PHASE_2_CONFIG.momentumReferencePct.toFixed(2)}%
          · Fees {(PHASE_2_CONFIG.takerFeePct * 2).toFixed(2)}%
        </div>
      )}
    </section>
  );
}
