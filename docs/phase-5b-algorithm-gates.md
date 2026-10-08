# Phase 5B — gated, direction-aware opportunity algorithm

## Contract

The engine is versioned as `phase-5b-gated-direction-aware-v1` and the UI/data configuration as `phase-5b-buy-sell-balance-v1`. Every new `OpportunityAnalysis` contains both values so research records can be replayed against the exact rules used at detection time.

## Hard gates

The cron no longer copies the Wallex ticker into the external reference field. A candidate is never eligible unless it has an independent reference, fresh Bitpin/Wallex/reference quotes, at least 20 synchronized closed one-minute candle pairs, directional participation of at least 50%, a direction-consistent spread, a target strictly above entry and break-even, and positive expected net profit after all configured costs.

Rejected candidates use explicit decisions: `NO_TRADE_INSUFFICIENT_DATA`, `NO_TRADE_STALE_QUOTE`, `NO_TRADE_DIRECTION_CONFLICT`, `NO_TRADE_INVALID_TARGET`, or `NO_TRADE_NEGATIVE_EDGE`. The cron may still persist rejected observations for research, but it cannot open a trade opportunity from them.

## Directional evidence

Neutral/neutral candle pairs are excluded from directional agreement and separately reported as `neutralPairRatio`. `directionalAgreementRatio` is calculated only over pairs where both venues moved directionally; `directionalParticipationRatio` measures how many pairs contain at least one directional move. The legacy `alignmentRatio` remains in the response only to keep old records readable; it is not used for eligibility.

## Execution economics

`lib/opportunity/economics.ts` is the shared fee-aware calculation contract. It accounts for entry taker fee, exit taker fee, slippage buffer, latency buffer, transfer cost, break-even price, net execution edge, and expected net profit. The legacy `edge.netPct` remains available for old UI/API consumers; `edge.executionNetPct` is the gated value used by the decision engine.

## Buy/Sell Balance

The accessible range control is a directional evidence gauge from SELL (0) to BUY (100). It is disabled when directional evidence is incomplete and always states that it is **not a calibrated probability of success**. It is explanatory only and does not authorize execution.

## Limitations

The current app does not have order-book depth or a live independent external connector. Therefore the production cron correctly remains `NO_TRADE_INSUFFICIENT_DATA` until an independent reference is configured; manual reference input is clearly labeled and is not treated as Wallex. The 20-pair minimum is a data sufficiency guard, not a guarantee of predictive power.
