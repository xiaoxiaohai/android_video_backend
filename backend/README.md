# Backend

Node.js + Fastify + PostgreSQL backend for:
- database schema management
- import APIs
- basic read APIs for frontend

## 1) Setup

```bash
cd backend
cp .env.example .env
npm install
```

Edit `.env`:
- `DATABASE_URL=postgresql://...`
- `DB_SSL_MODE=verify-full` (recommended for RDS)
- `DB_SSL_CA_PATH=/path/to/global-bundle.pem` (optional but recommended)

## 2) Migrate schema

```bash
npm run db:migrate
```

## 3) Run

```bash
npm run dev
# or
npm start
```

## 4) APIs

### Health
- `GET /health`

### Import
- `POST /api/import/content`
  - body: `{ "items": [content_item_json...] }`

- `POST /api/import/episodes/:movieId`
  - body: `{ "data": { "Season 1": [episode...], ... } }`
  - or direct array/object body

- `POST /api/import/home`
  - body:
  ```json
  {
    "mode": "replace",
    "banner": [ ... ],
    "channels": [ ... ],
    "sections": [ ... ]
  }
  ```

### Read
- `GET /api/content?type=1|2&page=1&size=30&q=keyword`
  - `type=1` movies, `type=2` tv, omit for all
  - returns `{ items, page, size, total, has_more }`
- Note: all API responses strip `raw` fields from output payload.
- `GET /api/home`
- `GET /api/content/:id`
- `GET /api/content/by-movie-id/:movieId?type=1|2`
- `GET /api/tv/:movieId/episodes`

### Admin
- `GET /api/admin/stats?type=1|2`
- `POST /api/admin/cleanup-test-data`
  - default cleans test ids inserted during API testing
  - body (optional):
  ```json
  {
    "contentIds": [990001],
    "movieIds": ["t990001"],
    "episodeIds": [991001, 991002, 992001],
    "dryRun": false
  }
  ```
  - if `ADMIN_API_KEY` is set in env, include header `x-admin-key: <key>`

### Demo Resolver
- `POST /api/demo/resolve-m3u8`
  - body:
  ```json
  {
    "watchUrl": "https://f2moviesz.uk/watch-movie/watch-on-a-string-movies-free-hd-142161.12991693",
    "referer": "https://f2moviesz.uk/",
    "origin": "https://f2moviesz.uk"
  }
  ```
  - returns m3u8 candidate list extracted from watch page html/js
  - this is a demo parser; some sources still need extra ajax/decrypt/challenge bypass

## 5) Example curl

```bash
curl -X POST http://localhost:8080/api/import/content \
  -H 'Content-Type: application/json' \
  -d '{"items":[{"id":3,"movie_id":"66732","type":2,"title":"Stranger Things","channels":{"UpCloud":"https://..."}}]}'
```

## 6) Upstream collection

Upstream collection/decrypt/sync is managed by `collector` only.
Backend keeps import/read/admin APIs and no longer includes sync jobs.
