# openclaw-monitor

This repo contains the **backend aggregation API** (Node http server) and a **Dashboard frontend**.

## Backend (API)

```bash
npm install
npm run check
npm test
npm start
```

API base (preferred): `http://127.0.0.1:3000/api/...`

Back-compat (legacy): `http://127.0.0.1:3000/api/v1/...`

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
