# Quick Project Overview `crypto2`

This document is meant for fast onboarding, so you can understand the project without reading every file.

## 1) This repository has two main domains

1. **Crypto Dashboard App (runtime part)**
- Stack: `Node.js + Express + TypeScript + EJS + Tailwind + jQuery + Lightweight Charts`.
- Purpose: show Binance USDT perpetual futures symbols and render multiple candlestick charts.
- Key folders: `index.ts`, `src/`, `views/`, `public/`, `dist/`, `release/`.

2. **Skills Registry Content and Tooling**
- Large skills dataset in `skills/`, generated catalog/index files (`CATALOG.md`, `skills_index.json`, `data/*.json`), and maintenance scripts in `scripts/` and `lib/`.
- This part is content/tooling infrastructure, not the runtime chart app.

## 2) Runtime architecture (chart app)

High-level flow:

1. Browser opens `/` -> `PageController` renders `views/index.ejs`.
2. Frontend calls `/api/coins` to get available futures symbols.
3. Frontend calls `/api/klines?symbol=...&interval=...&limit=...` to get candle data.
4. `CoinController` delegates to `BinanceService`, which calls Binance Futures API.
5. Frontend converts API response and renders charts with `Lightweight Charts`.

Main backend entry points:
- `index.ts`: app bootstrap, middleware setup, routes, error handler, static files, optional auto-open browser.
- `src/routes/main.ts`: route definitions.
- `src/controllers/coinController.ts`: request validation and API responses.
- `src/services/binanceService.ts`: Binance integration and symbol filtering (`PERPETUAL + USDT + TRADING`).

## 3) API contract summary

1. `GET /api/coins`
- Returns: array of `{ symbol, baseAsset, quoteAsset }`.

2. `GET /api/klines?symbol=BTCUSDT&interval=15m&limit=100`
- Required query params: `symbol`, `interval`.
- `limit` defaults to `100`.
- Returns: candle arrays in this shape:
`[openTime, open, high, low, close, volume, closeTime, quoteVolume, trades, baseAssetVolume, quoteAssetVolume]`

## 4) Directory map for fast navigation

- `index.ts`: server entrypoint.
- `src/controllers/`: HTTP request handlers.
- `src/services/`: business logic / external API integration.
- `src/middlewares/`: request logging + global error handling.
- `src/utils/logger.ts`: Winston logger (console + `logs/` files).
- `views/`: EJS templates.
- `public/js/chart.js`: main frontend behavior (selection, search, pagination, lazy rendering, retry queue).
- `public/js/components/chart-component.js`: chart wrapper around Lightweight Charts.
- `src/input.css` + `tailwind.config.js`: styling pipeline.
- `scripts/` + `lib/`: scripts and helpers for skills registry maintenance.
- `skills/`: large skill content tree.

## 5) How to run and build (chart app)

1. Development:
```bash
pnpm install
pnpm dev
```

2. Build:
```bash
pnpm build
```

3. Packaging:
- CJS bundle: `pnpm build:pkg:bundle`
- Windows executable: `pnpm build:exe`

## 6) Important environment variables

- `PORT`: server port (default `3000`).
- `AUTO_OPEN_BROWSER=1`: force open browser after server starts.
- `DISABLE_AUTO_OPEN_BROWSER=1`: disable auto-open behavior in packaged runtime.
- `LOG_LEVEL`: Winston log level (default `info`).

## 7) Recommended reading order

1. `package.json`
2. `index.ts`
3. `src/routes/main.ts`
4. `src/controllers/coinController.ts`
5. `src/services/binanceService.ts`
6. `public/js/chart.js`
7. `views/index.ejs`
8. `src/utils/logger.ts`

If you need the skills-registry side:
1. `scripts/build-catalog.js`
2. `lib/skill-utils.js`
3. `docs/GETTING_STARTED.md`

## 8) Important caveats

1. `README.md` currently contains Vite/React template text and does not describe this runtime app.
2. `.github/workflows/ci.yml` is focused on skills registry validation/generation and is not aligned with only the chart runtime flow.
3. `server/` is currently empty.

## 9) Brainstorming notes (decision summary)

1. The document is optimized for quick orientation with a project map plus runtime flow.
2. Priority is given to files that actually drive runtime behavior (`index.ts`, `src`, `views`, `public`).
3. The app runtime and skills-registry domains are separated explicitly to avoid onboarding confusion.

## 10) USDT-Only Filter Roadmap (agreed plan)

Scope lock:
- Keep universe as `USDT Perpetual` only.
- Do not add filters that require non-USDT symbols.

### V1 filters to build

1. `24h Volume >= X`
2. `Funding Rate range`
3. `Open Interest >= X`

### Phase plan

Status update (February 14, 2026):
- Phase 1: completed.
- Phase 2: completed.
- Phase 3: completed.

1. Phase 1 (priority): Volume filter - completed
- Backend: add a market snapshot endpoint for USDT perpetual symbols.
- Frontend: add `Min Volume` filter controls in sidebar and apply locally.
- Goal: reduce low-liquidity charts before render.

2. Phase 2: Funding filter - completed
- Backend: add funding snapshot endpoint with short cache.
- Frontend: add funding min/max (or absolute range).
- Goal: select contracts by carry cost regime.

3. Phase 3: Open Interest filter - completed
- Backend: add OI snapshot endpoint with cache and controlled fetch scope.
- Frontend: add `Min OI` filter.
- Goal: keep contracts with stronger participation/depth.

### Suggested endpoint additions

1. `GET /api/market-snapshot`
- Per symbol: `symbol`, `volume24h`, `priceChangePercent24h`, `lastPrice`

2. `GET /api/funding-snapshot`
- Per symbol: latest funding rate (cached refresh)

3. `GET /api/oi-snapshot?symbols=...`
- Per symbol: open interest (cached, batched by requested symbols)

### Files expected to change

- `src/services/binanceService.ts`
- `src/controllers/coinController.ts`
- `src/routes/main.ts`
- `views/partials/sidebar.ejs`
- `public/js/chart.js`

### Cost and refresh strategy

- Prefer snapshot + cache over per-chart API calls.
- Filter metrics are not tick-level realtime:
  - market snapshot: periodic refresh
  - funding: short periodic refresh
  - OI: slower refresh than funding

### Out of scope for this plan

- Quote/settlement filter (`USDT/USDC/...`)
- Contract type filter outside current USDT perpetual universe
- Bullish/Bearish classification filters
