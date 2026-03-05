# Collector (local)

This local collector does two things:
1. Pull upstream decrypted JSON from reverse-engineered APIs
2. Upload to your backend import APIs

## Setup

```bash
cd collector
cp .env.example .env
npm install
```

Edit `.env`:
- `BACKEND_BASE_URL` -> your backend URL
- Tune sync paging/concurrency/rate limit

## Run

```bash
npm run sync:home
npm run sync:movie
npm run sync:tv
npm run sync:full
```

## Output files (every run)

Each run creates a folder under `SYNC_OUTPUT_DIR` (default `./output/<runId>`):

- `upstream/*.json` : every pulled and decrypted upstream JSON
- `report/summary.json` : overall stats
- `report/imports.json` : backend import result list (ok/fail per call)
- `report/errors.json` : errors list

Collector provides continuous logs during sync:
- page progress logs
- upstream request/response traces (`SYNC_VERBOSE_LOG=true`)
- backend import success/failure traces

## Full import strategy

For near-full import:
1. `SYNC_MAX_MOVIE_PAGES=0`
2. `SYNC_MAX_TV_PAGES=0`
3. Keep `SYNC_HARD_PAGE_LIMIT` high enough (default 5000)
4. Start with conservative settings:
   - `SYNC_DETAIL_CONCURRENCY=2~3`
   - `SYNC_REQUEST_INTERVAL_MS=200~500`
5. Keep `SYNC_STOP_ON_DUPLICATE_PAGE=true` to stop immediately when duplicated pages appear
