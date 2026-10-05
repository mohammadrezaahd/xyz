# XYZ — Tether Exchange Comparison

Phase 1: side-by-side 1-minute Tether/Toman candlestick charts for Bitpin and Wallex.

## Architecture

- Next.js App Router + TypeScript.
- Server-side `/api/candles` proxy keeps exchange configuration and secrets off the browser.
- Bitpin uses the TradingView candle endpoint:
  `GET /v1/mkt/tv/get_bars/`
- Bitpin Tether market: `USDT_IRT`.
- Wallex uses its public UDF history endpoint.
- No database in Phase 1; historical candles come from the exchanges.
- Polling defaults to 15 seconds.

## Bitpin

The candle endpoint accepts:

- `symbol`
- `res`
- `from`
- `to`

Bitpin's `get_bars` endpoint returns at most 10,000 bars per request. At 1-minute resolution, the chart therefore loads roughly 6.94 days of history per refresh. This is configured through `BITPIN_MAX_BARS` and `BITPIN_INITIAL_DAYS`.

The candle endpoint is public, so `BITPIN_API_KEY` and `BITPIN_SECRET_KEY` are **not sent with candle requests**. They are kept in `.env.local` for future authenticated Bitpin features.

Authenticated Bitpin market-data endpoints have a documented limit of 200 requests/minute and 10,000/day in the available API client documentation. citeturn4search0turn4search2

## Setup

1. Copy `.env.example` to `.env.local`.
2. Put your real Bitpin `BITPIN_API_KEY` and `BITPIN_SECRET_KEY` values into `.env.local`.
3. Keep `.env.local` out of Git.
4. Run `npm install`, then `npm run dev`.
5. Open `http://localhost:3000`.

## Data strategy

The app does not persist candles in a database in Phase 1. The exchange APIs remain the source of truth and the browser displays the returned history.

A persistent DB becomes justified later if XYZ must retain history beyond exchange API range limits, backfill gaps, or maintain a complete independent dataset during exchange/API outages.

For real-time updates, a later phase can move from REST polling to Bitpin/Wallex WebSockets while keeping the same chart component.
