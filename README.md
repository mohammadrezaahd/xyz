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

Bitpin's `get_bars` endpoint returns at most 10,000 bars per request. At 1-minute resolution, the current request therefore provides roughly 6.94 days of Bitpin candles. Wallex history is requested for 20 days, but synchronized forecasting/backtesting is constrained by the shorter Bitpin history. The research endpoints share a short-lived server-side candle result to avoid repeated exchange requests during a dashboard refresh. Longer synchronized history requires a background backfill and persistent candle storage; fetching many historical chunks inside a live request exceeded Vercel's runtime limit, so that approach is intentionally not used.

The candle endpoint is public, so `BITPIN_API_KEY` and `BITPIN_SECRET_KEY` are **not sent with candle requests**. They are kept in `.env.local` for future authenticated Bitpin features.

Authenticated Bitpin market-data endpoints have a documented limit of 200 requests/minute and 10,000/day in the available API client documentation. citeturn4search0turn4search2

## Setup

1. Copy `.env.example` to `.env.local`.
2. Put your real Bitpin `BITPIN_API_KEY` and `BITPIN_SECRET_KEY` values into `.env.local`.
3. Keep `.env.local` out of Git.
4. Run `npm install`, then `npm run dev`.
5. Open `http://localhost:3000`.

## Research and forecasting

- **Stability Score** uses the last 10 synchronized closed candle pairs and the main-compatible 0.05% movement threshold.
- **Buy/Sell Balance** is a separate directional-evidence indicator with its own 30-pair window and 20-pair minimum. It is not a calibrated probability.
- **Market Forecast** produces experimental 5-, 15-, and 30-minute direction scores from synchronized momentum, trend acceleration, venue agreement, realized volatility, and Bitpin volume pressure.
- The same feature score is evaluated by a chronological holdout backtest and compared with a simple last-candle baseline. Net results deduct the configured round-trip cost assumption. Current validation uses about one week of synchronized 1-minute data, so results remain sensitive to the selected market regime.
- Stability regime analysis matches stored point-in-time observations to subsequent contiguous candle windows; it reports sample counts so small groups are not mistaken for evidence.

Forecast scores are research signals, not guarantees or automatic trading instructions. Historical directional accuracy alone is insufficient: the model must also show positive net performance after realistic fees and slippage before being considered economically useful.

Candle history remains sourced from the exchanges; MongoDB stores research observations and outcomes, not fabricated market candles.

For real-time updates, a later phase can move from REST polling to Bitpin/Wallex WebSockets while keeping the same chart component.
