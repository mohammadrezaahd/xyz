"use client";

import { useState } from "react";
import { PHASE_2_CONFIG } from "@/lib/opportunity/config";
import type { OpportunityAnalysis, TestResult } from "@/lib/opportunity/types";

type OpportunityPanelProps = {
  analysis: OpportunityAnalysis;
  externalPrice: string;
  onExternalPriceChange: (value: string) => void;
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

function testClass(status: TestResult["status"]): string {
  return `testStatus ${status.toLowerCase()}`;
}

function TestRow({
  label,
  result,
}: {
  label: string;
  result: TestResult;
}) {
  return (
    <div className="testRow">
      <span>{label}</span>
      <span className={testClass(result.status)}>
        {result.status}
      </span>
    </div>
  );
}

export function OpportunityPanel({
  analysis,
  externalPrice,
  onExternalPriceChange,
}: OpportunityPanelProps) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <section className="opportunity card">
      <div className="opportunityHeader">
        <div>
          <div className="exchange">
            Opportunity / Stability
          </div>
          <div className="symbol">
            Historical validation · not a guaranteed prediction
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
              placeholder="e.g. 280000"
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

        <div className="opportunityGroup tests">
          <h3>Stability Tests</h3>
          <TestRow
            label="External Wallex Validation"
            result={analysis.validation.external}
          />
          <TestRow
            label="Wallex &gt; Bitpin"
            result={analysis.validation.wallexAboveBitpin}
          />
          <TestRow
            label="Spread Threshold"
            result={analysis.validation.spread}
          />
          <TestRow
            label="Bitpin Bullish Ratio"
            result={analysis.validation.bitpinBullish}
          />
          <TestRow
            label="Wallex Bullish Ratio"
            result={analysis.validation.wallexBullish}
          />
          <TestRow
            label="Candle Alignment"
            result={analysis.validation.candleAlignment}
          />
          <TestRow
            label="Target Viability"
            result={analysis.validation.targetViability}
          />
        </div>

        <div className="opportunityGroup">
          <h3>Candle Statistics</h3>
          <div className="metric">
            <span>Lookback</span>
            <strong>{analysis.candles.lookback}</strong>
          </div>
          <div className="metric">
            <span>Synchronized</span>
            <strong>{analysis.candles.synchronized} / {analysis.candles.lookback}</strong>
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
            <span>Safe Target · Wallex Ticker</span>
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
