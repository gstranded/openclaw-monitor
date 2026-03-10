export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || '/api'
export const API_V1_BASE = `${API_BASE.replace(/\/$/, '')}/v1`

export const DASHBOARD_POLL_MS = Number(import.meta.env.VITE_DASHBOARD_POLL_MS || 10000)
