# Phase 5A — Data Collection Foundation

## Purpose

Phase 5A creates a durable research dataset from live opportunity detections and optional Phase 4 paper-position outcomes. It answers:

> What opportunity was detected, what did the algorithm predict, was it paper-tested, and what actually happened?

This phase does **not** implement the full historical backtesting engine, automatic threshold optimization, live trading, or the Phase 6 dashboard.

## Research observation schema

Research observations live in the `researchObservations` MongoDB collection and are distinct from both `opportunities` (Phase 3) and `testPositions` (Phase 4).

Each observation contains:

- Identity and lifecycle: `_id`, deterministic `observationKey`, `createdAt`, `updatedAt`, `status`, and `source`.
- Detection identity: `detectedAt`, `engineVersion`, and `configurationVersion`.
- Market snapshot: Bitpin, Wallex, external reference, spread, freshness, and provider availability. Missing inputs remain `null`.
- Compact candle snapshot: timeframe, lookback, synchronized count, bullish ratios, alignment, average directional move, and momentum score. Full candle arrays are not persisted.
- `stabilityChecks`: every engine check, including status, actual value, threshold, and comparison direction.
- Immutable `prediction`: classification, strength, direction, score, risk, completeness, entry/target, expected fee-aware result, break-even, and liquidation values.
- Phase 4 linkage: `paperPositionId` and `paperPositionStartedAt`.
- Separate `actual` outcome namespace, initially populated with `null` values.

The current engine does not expose a distinct confidence value, so `prediction.confidence` is explicitly `null`; `dataCompleteness` is retained separately and is not mislabeled as confidence.

## Relationship between phases

```text
Phase 3 opportunity
        ↓ sourceOpportunityId
Phase 5 research observation
        ↓ optional paperPositionId
Phase 4 paper position
        ↓ actual outcome
Resolved research observation
```

Phase 3 history remains in the existing `opportunities` collection and UI. Phase 4 remains in `testPositions`. Phase 5 stores the immutable research comparison record.

## Lifecycle states

- `DETECTED`: eligible live opportunity was observed; no linked paper test has started.
- `PAPER_STARTED`: a Phase 4 paper position is linked.
- `RESOLVED`: the linked Phase 4 position has a terminal outcome synchronized into `actual`.
- `EXPIRED`: reserved for a future controlled expiry workflow; not assigned by Phase 5A.
- `INVALIDATED`: reserved for a future controlled invalidation workflow; not assigned by Phase 5A.

Typical flows:

```text
DETECTED → PAPER_STARTED → RESOLVED
```

and:

```text
DETECTED → no paper test
```

## Deduplication

The observation key is a SHA-256 digest of stable detection properties:

```text
source + engineVersion + configurationVersion + market symbol
+ UTC minute detection bucket + Bitpin price + Wallex price + classification
```

The key is deterministic, uses a one-minute detection bucket, and is protected by a unique MongoDB index. A duplicate-key race is handled by returning the existing document with `created: false`; it is not surfaced as an unexpected HTTP 500.

A different minute, price, or opportunity classification produces a different key, avoiding collapse of genuinely separate detections.

## Live collection behavior

`GET /api/cron/opportunities` continues to run the existing analysis exactly once. For an eligible detection it also builds a research observation from that same `OpportunityAnalysis` object. Collection is independent of whether a user opens the website or starts a Phase 4 position.

The existing Phase 3 opportunity insert and monitoring behavior is preserved. If research persistence is temporarily unavailable, the cron reports `researchError` and continues the existing Phase 3 response so a data-collection outage does not corrupt Phase 3 lifecycle state.

Transient provider failures and incomplete market data do not create fabricated research observations. Valid but incomplete analysis values are recorded as explicit `null` values when a record is otherwise eligible.

## Phase 4 linking and outcome synchronization

When `startTestPosition` receives an opportunity ID, it looks up the corresponding Phase 5 observation by `sourceOpportunityId` after inserting the Phase 4 position. Linking is idempotent and changes only lifecycle/linkage fields; the prediction snapshot is never overwritten. Manual positions without an opportunity remain unlinked.

When a Phase 4 position reaches a terminal state—target, liquidation, or manual close—the service writes the separate `actual` object and changes the observation to `RESOLVED`. The update is idempotent: an existing resolved outcome is never overwritten. Research synchronization errors are logged safely after the Phase 4 position write and do not invalidate the position.

## APIs

### `GET /api/research/observations`

Supported query parameters:

- `status`: `DETECTED`, `PAPER_STARTED`, `RESOLVED`, `EXPIRED`, `INVALIDATED`, or `ALL`.
- `source`: `LIVE_CRON`, `BACKTEST`, or `ALL`.
- `from`, `to`: ISO date bounds against `detectedAt`.
- `limit`: integer from 1 to 100; default 50.

Responses normalize ObjectIds and Dates to strings and include `observations`, `total`, `limit`, and `filters`.

### `GET /api/research/summary`

Returns aggregate counts and outcome metrics, including total observations, paper-started/resolved counts, target hits, liquidations, manual closes, average net P&L, and average duration.

No destructive research API operations are exposed.

## Metrics definitions

`lib/research/metrics.ts` provides deterministic reporting helpers:

- `observationsWithPaperTests`: observations with a non-null `paperPositionId`.
- `observationsWithoutPaperTests`: all other observations.
- `resolvedObservations`: observations with `RESOLVED` status and a resolved timestamp.
- `winRate`: `targetHits / resolvedObservations`; `null` when there are no resolved observations.
- Average net P&L and ROI: resolved observations with finite values only; `null` when unavailable.
- Average duration: resolved observations with finite durations only; `null` when no durations exist.

False-positive and false-negative rates are intentionally not reported; those require a defensible Phase 5B ground-truth/backtesting definition.

## Known limitations

- `confidence` is unavailable in the existing Phase 2 analysis contract and is stored as `null`.
- The `BACKTEST` source is reserved but no backtesting engine is implemented.
- Expiry and controlled invalidation workflows are reserved for a later phase.
- The local environment may not have MongoDB credentials, so integration tests are skipped unless `MONGODB_URI` and `MONGODB_DB_NAME` are configured.
- No Phase 5 UI or dashboard is included.
