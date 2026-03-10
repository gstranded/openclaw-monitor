# openclaw-monitor

This repo contains the **backend aggregation API** (Node http server) and a **Dashboard frontend**.

## Backend (API)

Prereqs: Node.js >= 20.

```bash
# from repo root
npm install
npm run check
npm test

export OPENCLAW_RUNTIME_DIR=/abs/path/to/claw_team/runtime
npm start
# -> http://127.0.0.1:3000
```

API base (preferred): `http://127.0.0.1:3000/api/...`

Back-compat (legacy): `http://127.0.0.1:3000/api/v1/...`

### Runtime data sources

This service reads OpenClaw runtime snapshots from JSON files:

- `scores.json`
- `tasks.json`
- `events.json`

Environment:

- `OPENCLAW_RUNTIME_DIR`: directory containing the runtime JSON files.
  - If unset, the server will walk up from repo root looking for `tasks.json`.

APIs return a `meta` envelope with:

- `meta.partial`
- `meta.degradeReasons`
- `meta.freshness` (per source)

### SSE events stream

- `GET /api/events/stream` (SSE)

### Markdown management (boundaries / rollback / audit)

Endpoints:

- `GET /api/markdown/files`
- `GET /api/markdown/read?fileId=...`
- `POST /api/markdown/preview` `{ fileId, content }`
- `POST /api/markdown/save` `{ fileId, content, expectedContent? }`
  - Optional actor: header `x-openclaw-actor` or JSON body field `actor`.

Policy file:

- `config/markdown-boundaries.json`

When enabled by config:

- Backup is written to: `.rollback/markdown-edits/`
- Audit record is appended to: `.audit/markdown-edits.jsonl`

## One-click local run

```bash
export OPENCLAW_RUNTIME_DIR=/abs/path/to/claw_team/runtime
./scripts/run_local.sh
```

Notes:

- `OPENCLAW_RUNTIME_DIR` should point at a directory containing `scores.json`, `tasks.json`, and `events.json` (for example `claw_team/runtime`).
- If a `web/` frontend exists, `./scripts/run_local.sh` will attempt to start it as well (best-effort). Otherwise it only starts the backend.

## Frontend (Dashboard + Agent detail + Markdown)

```bash
cd web
npm install
npm run dev
```

The Vite dev server proxies `/api` to `http://127.0.0.1:3000`.

Routes (frontend):
- `/` dashboard
- `/agents/:agentId` agent detail
- `/markdown` markdown allowlist list
- `/markdown/:fileId` markdown editor (preview diff + save)

## CI

GitHub Actions runs:

- backend: `npm run check` + `npm test`
- markdown boundaries validation (`scripts/check_markdown_boundaries.py`)
- frontend build only when `web/package.json` exists
