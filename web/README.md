# Dashboard frontend (V1)

## Dev

```bash
npm install
npm run dev
```

By default it calls backend via the Vite proxy:
- `/api/v1/agents`
- `/api/v1/leaderboard`
- `/api/v1/agents/:agentId` (for recent events + source status)

Environment:
- `VITE_API_BASE` (default `/api`)
- `VITE_DASHBOARD_POLL_MS` (default `10000`)
