# Dashboard frontend (V1)

## Dev

```bash
npm install
npm run dev
```

By default it calls backend via the Vite proxy (`/api` → `http://127.0.0.1:3000`):

- Dashboard aggregator: `GET /api/dashboard`
- Agent detail: `GET /api/agents/:agentId`
- Markdown allowlist:
  - `GET /api/markdown/files`
  - `GET /api/markdown/read?fileId=...`
  - `POST /api/markdown/preview`
  - `POST /api/markdown/save`

Back-compat fallback (legacy):
- `/api/v1/agents`
- `/api/v1/leaderboard`
- `/api/v1/agents/:agentId` (recent events + source status)

Environment:
- `VITE_API_BASE` (default `/api`)
- `VITE_DASHBOARD_POLL_MS` (default `10000`)
