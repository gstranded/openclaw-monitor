# openclaw-monitor

This repo contains the **backend aggregation API** (Node http server) and a **Dashboard frontend**.

## Backend (API)

```bash
npm install
npm run check
npm test
npm start
```

API base: `http://127.0.0.1:3000/api/v1/...`

## Frontend (Dashboard)

```bash
cd web
npm install
npm run dev
```

The Vite dev server proxies `/api` to `http://127.0.0.1:3000`.
