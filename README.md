# XYZ — Tether Exchange Comparison

Phase 1: side-by-side 1-minute Tether/Toman candlestick charts for Bitpin and Wallex.

## Architecture
- Next.js App Router + TypeScript.
- Server-side /api/candles proxy keeps exchange configuration off the browser.
- Wallex uses its public TradingView/UDF history endpoint.
- Bitpin is configured through the exact candle endpoint/query names from the current Bitpin docs via .env.
- No database in Phase 1; historical candles come from the exchanges.
- Polling defaults to 15 seconds, far below the documented/observed REST limits.

## Setup
1. Copy .env.example to .env.local.
2. Put the exact Bitpin candle endpoint and parameter names from the current docs into the Bitpin variables.
3. Run npm install then npm run dev.
4. Open http://localhost:3000.

## Data strategy
Wallex's public UDF candle endpoint is GET /v1/udf/history with symbol, resolution, from and to. Its public endpoint does not require an API key. The API documentation also recommends WebSockets for real-time market data rather than repeated REST polling.

A persistent DB becomes justified in a later phase if XYZ must retain history beyond an exchange's API retention/range limits or must remain complete during upstream outages.
