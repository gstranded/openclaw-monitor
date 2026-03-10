import { API_BASE, API_V1_BASE } from './config'
import { fetchJson, HttpError } from './fetchJson'

export type AgentDetail = {
  id: string
  name: string
  role?: string
  status?: string
  currentModel?: string
  currentBranch?: string
  activeTaskTitle?: string
  lastActivityAt?: string
  recentEvents?: Array<{
    id: string
    ts: string
    title: string
    summary: string
    severity: 'info' | 'warn' | 'error'
  }>
  sourceStatus?: Array<{ name: string; status: 'ok' | 'degraded' | 'unavailable'; message?: string }>
}

function mapSeverity(sev?: string): 'info' | 'warn' | 'error' {
  if (sev === 'warning') return 'warn'
  if (sev === 'error') return 'error'
  return 'info'
}

export async function loadAgentDetail(agentId: string, opts?: { signal?: AbortSignal }): Promise<AgentDetail> {
  const tryUrls = [`${API_BASE.replace(/\/$/, '')}/agents/${encodeURIComponent(agentId)}`, `${API_V1_BASE}/agents/${encodeURIComponent(agentId)}`]

  let lastErr: unknown
  for (const url of tryUrls) {
    try {
      const res = await fetchJson<any>(url, { timeoutMs: 10_000, signal: opts?.signal })

      // New style (if backend provides it)
      const data = res?.data ?? res

      // V1 fallback mapping
      if (data?.agentId || data?.displayName) {
        return {
          id: data.agentId ?? agentId,
          name: data.displayName ?? agentId,
          role: data.role ?? data.title,
          status: data.status,
          currentModel: data.currentModel,
          currentBranch: data.currentBranch,
          activeTaskTitle: data.activeTask?.title,
          lastActivityAt: data.lastActivityAt,
          recentEvents: (data.recentEvents || []).map((ev: any) => ({
            id: ev.eventId,
            ts: ev.timestamp,
            title: ev.title,
            summary: ev.summary,
            severity: mapSeverity(ev.severity)
          })),
          sourceStatus: (data.sourceStatus || []).map((s: any) => ({
            name: s.name,
            status: s.status,
            message: s.message
          }))
        }
      }

      // If unknown shape, still return a minimal object
      return {
        id: agentId,
        name: agentId,
        recentEvents: [],
        sourceStatus: []
      }
    } catch (e) {
      // If endpoint missing, continue to fallback
      if (e instanceof HttpError && (e.status === 404 || e.status === 405)) {
        lastErr = e
        continue
      }
      lastErr = e
      continue
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}
