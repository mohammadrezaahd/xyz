# Algorithm Evaluation

Evaluation uses only resolved Phase 5A observations. Unresolved observations are excluded.

The immutable baseline is `phase-5a-live-default-v1`. New behavior must receive a new configuration version; historical observations are never rewritten.

`lib/research/algorithm-evaluation.ts` requires at least 30 resolved observations and returns `INSUFFICIENT_SAMPLE` below that threshold. It reports target-hit rate, liquidation rate, average net P&L/ROI/duration, cumulative drawdown, and segmentation by available risk/stability/spread/lookback/bullish-ratio/alignment/momentum fields.

Recommendations are shadow/review-only. A higher win rate is not sufficient if liquidation, drawdown, or net P&L deteriorates.