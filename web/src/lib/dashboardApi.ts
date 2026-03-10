import type {
  DashboardHealth,
  DashboardResponse,
  EventItem,
  LeaderboardEntry,
  TimelineItem
} from './dashboardTypes'
import { API_BASE, API_V1_BASE } from './config'
import { fetchJson, HttpError } from './fetchJson'

type V1Meta = {
  partial?: boolean
  collectedAt?: string
  degradeReasons?: string[]
  sourceLagMs?: number
}

type V1Agent = {
  agentId: string
  displayName: string
  role?: string
  title?: string
  status?: string
  healthScore?: number
  lastActivityAt?: string
  activeTask?: { title?: string }
}

type V1AgentsResponse = { data: V1Agent[]; meta?: V1Meta }

type V1LeaderboardEntry = {
  agentId: string
  displayName: string
  leaderboardScore: number
  throughput24h?: number
  stabilityScore?: number
}

type V1LeaderboardResponse = { data: V1LeaderboardEntry[]; meta?: V1Meta & { window?: string; sortBy?: string } }

type V1SourceState = {
  name: string
  status: 'ok' | 'degraded' | 'unavailable'
  message?: string
  collectedAt?: string
}

type V1TimelineEvent = {
  eventId: string
  timestamp: string
  kind?: string
  title: string
  summary: string
  severity: 'info' | 'warning' | 'error'
}

type V1AgentDetailResponse = {
  data: {
    recentEvents?: V1TimelineEvent[]
    sourceStatus?: V1SourceState[]
  }
  meta?: V1Meta
}

function toHealthFromV1(meta?: V1Meta, sourceStates?: V1SourceState[]): DashboardHealth {
  if (meta?.partial) return 'partial'
  if ((meta?.degradeReasons || []).length) return 'degraded'
  if ((sourceStates || []).some((s) => s.status !== 'ok')) return 'degraded'
  return 'ok'
}

function sourceHealth(status: V1SourceState['status']): DashboardHealth {
  if (status === 'ok') return 'ok'
  if (status === 'degraded') return 'degraded'
  return 'error'
}

function mapSeverity(sev: V1TimelineEvent['severity']): 'info' | 'warn' | 'error' {
  if (sev === 'warning') return 'warn'
  return sev
}

/**
 * Load dashboard data via backend APIs.
 *
 * - Prefer the new aggregator endpoint: GET `${API_BASE}/dashboard` (if present)
 * - Fallback to existing V1 endpoints in this repo:
 *   - GET `${API_V1_BASE}/agents`
 *   - GET `${API_V1_BASE}/leaderboard`
 *   - GET `${API_V1_BASE}/agents/:agentId` (recent events + source status)
 */
export async function loadDashboardSnapshot(opts?: { signal?: AbortSignal }): Promise<DashboardResponse> {
  // 1) Try aggregator endpoint if it exists.
  try {
    const url = `${API_BASE.replace(/\/$/, '')}/dashboard`
    const res = await fetchJson<DashboardResponse>(url, { timeoutMs: 10_000, signal: opts?.signal })
    // If it looks usable, return it.
    if (res && (res.agents || res.leaderboard || res.timeline || res.events)) {
      return res
    }
  } catch (e) {
    // Only swallow "not implemented" style failures.
    if (!(e instanceof HttpError && (e.status === 404 || e.status === 405))) {
      // other errors still allow fallback, but keep going
    }
  }

  // 2) Fallback: compose from /api/v1
  const sources: DashboardResponse['meta'] extends infer M
    ? M extends { sources?: infer S }
      ? S
      : Record<string, any>
    : Record<string, any> = {}

  let partial = false
  let anySuccess = false

  const agentsUrl = `${API_V1_BASE}/agents?limit=8`
  const leaderboardUrl = `${API_V1_BASE}/leaderboard?limit=20&window=24h&sortBy=score`

  const [agentsSettled, leaderboardSettled] = await Promise.allSettled([
    fetchJson<V1AgentsResponse>(agentsUrl, { timeoutMs: 10_000, signal: opts?.signal }),
    fetchJson<V1LeaderboardResponse>(leaderboardUrl, { timeoutMs: 10_000, signal: opts?.signal })
  ])

  let agents: DashboardResponse['agents'] = []
  let leaderboard: LeaderboardEntry[] = []

  if (agentsSettled.status === 'fulfilled') {
    anySuccess = true
    const meta = agentsSettled.value.meta
    agents = (agentsSettled.value.data || []).map((a) => ({
      id: a.agentId,
      name: a.displayName,
      role: a.role || a.title,
      status:
        a.status === 'active'
          ? 'online'
          : a.status === 'idle'
            ? 'idle'
            : a.status === 'blocked'
              ? 'busy'
              : a.status === 'offline'
                ? 'offline'
                : 'unknown',
      lastSeenAt: a.lastActivityAt,
      currentTask: a.activeTask?.title,
      score: a.healthScore
    }))
    sources['agents'] = { health: toHealthFromV1(meta), message: `GET ${agentsUrl}` }
  } else {
    partial = true
    sources['agents'] = {
      health: 'error',
      message: agentsSettled.reason instanceof Error ? agentsSettled.reason.message : String(agentsSettled.reason)
    }
  }

  if (leaderboardSettled.status === 'fulfilled') {
    anySuccess = true
    const meta = leaderboardSettled.value.meta
    leaderboard = (leaderboardSettled.value.data || []).map((r) => ({
      agentId: r.agentId,
      name: r.displayName,
      points: Number.isFinite(r.leaderboardScore) ? Number(r.leaderboardScore.toFixed(1)) : 0
    }))
    sources['leaderboard'] = { health: toHealthFromV1(meta), message: `GET ${leaderboardUrl}` }
  } else {
    partial = true
    sources['leaderboard'] = {
      health: 'error',
      message:
        leaderboardSettled.reason instanceof Error ? leaderboardSettled.reason.message : String(leaderboardSettled.reason)
    }
  }

  // optional: agent detail for timeline/events + per-source statuses
  let timeline: TimelineItem[] = []
  let events: EventItem[] = []

  if (agents && agents.length) {
    const firstId = agents[0].id
    const detailUrl = `${API_V1_BASE}/agents/${encodeURIComponent(firstId)}`
    try {
      const detail = await fetchJson<V1AgentDetailResponse>(detailUrl, { timeoutMs: 10_000, signal: opts?.signal })
      anySuccess = true

      const recent = detail.data?.recentEvents || []
      timeline = recent.map((ev) => ({
        id: ev.eventId,
        ts: ev.timestamp,
        title: ev.title,
        detail: ev.summary,
        severity: mapSeverity(ev.severity)
      }))
      events = recent.map((ev) => ({
        id: ev.eventId,
        ts: ev.timestamp,
        type: ev.kind,
        message: ev.summary,
        severity: mapSeverity(ev.severity)
      }))

      const sourceStatus = detail.data?.sourceStatus || []
      for (const s of sourceStatus) {
        sources[`source:${s.name}`] = {
          health: sourceHealth(s.status),
          message: s.message
        }
      }

      const computedHealth = toHealthFromV1(detail.meta, sourceStatus)
      sources['agentDetail'] = { health: computedHealth, message: `GET ${detailUrl}` }

      if (detail.meta?.partial) partial = true
    } catch (e) {
      partial = true
      sources['agentDetail'] = {
        health: 'error',
        message: e instanceof Error ? e.message : String(e)
      }
    }
  }

  if (!anySuccess) {
    throw new Error('All dashboard sources failed (agents + leaderboard)')
  }

  const health: DashboardHealth = partial
    ? 'partial'
    : Object.values(sources).some((s: any) => s?.health === 'degraded')
      ? 'degraded'
      : 'ok'

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      health,
      sources: sources as any
    },
    agents,
    leaderboard,
    timeline,
    events
  }
}
