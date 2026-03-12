import type {
  AgentStatus,
  DashboardHealth,
  DashboardResponse,
  EventItem,
  LeaderboardEntry,
  TimelineItem
} from './dashboardTypes'
import { API_BASE, API_V1_BASE } from './config'
import { fetchJson, HttpError } from './fetchJson'

// --- Aggregator (/api/dashboard) envelope from the backend ---

type AggFreshness = {
  ok?: boolean
  updatedAt?: string
  lagMs?: number
}

type AggMeta = {
  partial?: boolean
  collectedAt?: string
  degradeReasons?: string[]
  sourceLagMs?: number
  freshness?: Record<string, AggFreshness>
}

type AggSourceStatus = {
  name: string
  status: 'ok' | 'degraded' | 'unavailable'
  message?: string
  collectedAt?: string
  updatedAt?: string | null
}

type AggAgent = {
  agentId: string
  displayName?: string
  role?: string
  status?: string
  lastActivityAt?: string | null
  activeTask?: { title?: string } | null
  score?: number
}

type AggLeaderboardEntry = {
  agentId?: string
  displayName?: string
  score?: number
}

type AggEvent = {
  id?: string
  at?: string
  kind?: string
  agentId?: string
  agent_id?: string
  title?: string
  summary?: string
  message?: string
  extra?: any
  severity?: 'info' | 'warning' | 'error'
}

type AggDashboardEnvelope = {
  data?: {
    agents?: AggAgent[]
    leaderboard?: AggLeaderboardEntry[]
    recentEvents?: AggEvent[]
    sourceStatus?: AggSourceStatus[]
  }
  meta?: AggMeta
}

function mapAgentStatus(status?: string): AgentStatus {
  if (status === 'active') return 'online'
  if (status === 'idle') return 'idle'
  if (status === 'blocked') return 'busy'
  if (status === 'offline') return 'offline'
  return 'unknown'
}

function mapSeverity(sev?: string): 'info' | 'warn' | 'error' {
  if (sev === 'warning') return 'warn'
  if (sev === 'error') return 'error'
  return 'info'
}

function inferSeverity(kind?: string, text?: string): 'info' | 'warn' | 'error' {
  const s = `${kind || ''} ${text || ''}`.toLowerCase()
  if (s.includes('error') || s.includes('fail') || s.includes('exception') || s.includes('panic')) return 'error'
  if (s.includes('warn') || s.includes('degrad') || s.includes('partial') || s.includes('timeout')) return 'warn'
  return 'info'
}

function pickSeverity(explicit?: string, kind?: string, text?: string): 'info' | 'warn' | 'error' {
  if (explicit) return mapSeverity(explicit)
  return inferSeverity(kind, text)
}

function toHealthFromAgg(meta?: AggMeta, sourceStates?: AggSourceStatus[]): DashboardHealth {
  if (meta?.partial) return 'partial'
  if ((meta?.degradeReasons || []).length) return 'degraded'
  if ((sourceStates || []).some((s) => s.status !== 'ok')) return 'degraded'
  return 'ok'
}

function sourceHealth(status: AggSourceStatus['status']): DashboardHealth {
  if (status === 'ok') return 'ok'
  if (status === 'degraded') return 'degraded'
  return 'error'
}

function normalizeAggEnvelope(envelope: AggDashboardEnvelope): DashboardResponse {
  const agentsRaw = envelope.data?.agents || []
  const leaderboardRaw = envelope.data?.leaderboard || []
  const eventsRaw = envelope.data?.recentEvents || []
  const sourceStatus = envelope.data?.sourceStatus || []
  const meta = envelope.meta

  const agents: DashboardResponse['agents'] = agentsRaw.map((a) => ({
    id: a.agentId,
    name: a.displayName || a.agentId,
    role: a.role,
    status: mapAgentStatus(a.status),
    lastSeenAt: a.lastActivityAt || undefined,
    currentTask: a.activeTask?.title,
    score: typeof a.score === 'number' ? a.score : undefined
  }))

  const leaderboard: LeaderboardEntry[] = leaderboardRaw.map((r) => ({
    agentId: r.agentId,
    name: r.displayName || r.agentId || 'unknown',
    points: typeof r.score === 'number' ? Number(r.score.toFixed(1)) : 0
  }))

  function humanizeKind(kind?: string) {
    if (!kind) return 'event'
    return kind.replace(/[-_]+/g, ' ')
  }

  function isMilestone(kind?: string, text?: string) {
    const k = (kind || '').toLowerCase()
    const t = (text || '').toLowerCase()

    // noisy background signals we don't want in Timeline
    if (k.includes('tick') || k.includes('heartbeat') || k.includes('poll')) return false
    if (k.includes('skip') || t.includes('skip')) return false

    // keep obvious lifecycle / state changes
    if (k.includes('error') || k.includes('fail') || k.includes('degrad') || k.includes('partial')) return true
    if (k.includes('task') || k.includes('issue') || k.includes('pr') || k.includes('merge')) return true
    if (k.includes('start') || k.includes('stop') || k.includes('restart') || k.includes('deploy') || k.includes('exit')) return true

    // fallback: keep only a small subset of less-actionable events
    return false
  }

  // sort events by time (old -> new) for stable grouping
  const sortedEvents = [...eventsRaw].sort((a, b) => {
    const aMs = a.at ? new Date(a.at).getTime() : 0
    const bMs = b.at ? new Date(b.at).getTime() : 0
    return aMs - bMs
  })

  const normalizedEvents: EventItem[] = sortedEvents.map((ev, idx) => {
    const agentId = ev.agentId || ev.agent_id
    const kind = ev.kind
    const message = ev.summary || ev.message || ev.title || ev.kind || 'event'

    let detail: string | undefined
    try {
      if (ev.extra?.reason) detail = String(ev.extra.reason)
      else if (ev.extra && Object.keys(ev.extra).length) detail = JSON.stringify(ev.extra, null, 2)
    } catch {
      // ignore
    }

    return {
      id: ev.id || `${ev.at || 'na'}-${idx}`,
      ts: ev.at || new Date().toISOString(),
      type: kind,
      agentId,
      title: ev.title || (kind ? humanizeKind(kind) : undefined),
      message,
      detail,
      severity: pickSeverity(ev.severity, kind, message)
    }
  })

  // Event stream should read newest -> oldest
  const events: EventItem[] = [...normalizedEvents].sort((a, b) => {
    const aMs = new Date(a.ts).getTime()
    const bMs = new Date(b.ts).getTime()
    return bMs - aMs
  })

  // Timeline should be "milestones" (state changes), not a firehose
  const timeline: TimelineItem[] = normalizedEvents
    .filter((ev) => isMilestone(ev.type, `${ev.title || ''} ${ev.message || ''}`))
    .slice(-80)
    .map((ev) => ({
      id: ev.id,
      ts: ev.ts,
      title: ev.title || ev.type || 'event',
      detail: ev.message,
      severity: ev.severity,
      meta: {
        agentId: ev.agentId,
        kind: ev.type
      }
    }))

  const sources: NonNullable<DashboardResponse['meta']>['sources'] = {}

  for (const s of sourceStatus) {
    const freshness = meta?.freshness?.[s.name]
    sources[s.name] = {
      health: sourceHealth(s.status),
      freshnessMs: typeof freshness?.lagMs === 'number' ? freshness.lagMs : undefined,
      message: s.message || s.status
    }
  }

  const health = toHealthFromAgg(meta, sourceStatus)

  return {
    meta: {
      generatedAt: meta?.collectedAt || new Date().toISOString(),
      health,
      sources
    },
    agents,
    leaderboard,
    timeline,
    events
  }
}

// --- Legacy /api/v1 fallback types ---

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
  // older field name
  healthScore?: number
  // current backend field name
  score?: number
  lastActivityAt?: string
  activeTask?: { title?: string }
}

type V1AgentsResponse = { data: V1Agent[]; meta?: V1Meta }

type V1LeaderboardEntry = {
  agentId: string
  displayName: string
  // older field name
  leaderboardScore?: number
  // current backend field name
  score?: number
}

type V1LeaderboardResponse = { data: V1LeaderboardEntry[]; meta?: V1Meta & { window?: string; sortBy?: string } }

type V1SourceState = {
  name: string
  status: 'ok' | 'degraded' | 'unavailable'
  message?: string
  collectedAt?: string
}

type V1TimelineEvent = {
  eventId?: string
  id?: string
  timestamp?: string
  at?: string
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

function v1SourceHealth(status: V1SourceState['status']): DashboardHealth {
  if (status === 'ok') return 'ok'
  if (status === 'degraded') return 'degraded'
  return 'error'
}

/**
 * Load dashboard data via backend APIs.
 *
 * - Prefer the backend aggregator endpoint: GET `${API_BASE}/dashboard`
 * - Fallback to V1 endpoints:
 *   - GET `${API_V1_BASE}/agents`
 *   - GET `${API_V1_BASE}/leaderboard`
 *   - GET `${API_V1_BASE}/agents/:agentId` (recent events + source status)
 */
export async function loadDashboardSnapshot(opts?: { signal?: AbortSignal }): Promise<DashboardResponse> {
  // 1) Try aggregator endpoint if it exists.
  try {
    const url = `${API_BASE.replace(/\/$/, '')}/dashboard`
    const res = await fetchJson<any>(url, { timeoutMs: 10_000, signal: opts?.signal })

    // If backend already returns the UI shape, just use it.
    if (res && (res.agents || res.leaderboard || res.timeline || res.events)) {
      return res as DashboardResponse
    }

    // Backend currently returns an envelope: { data: {...}, meta: {...} }
    if (res && res.data && (res.data.agents || res.data.leaderboard || res.data.recentEvents)) {
      return normalizeAggEnvelope(res as AggDashboardEnvelope)
    }
  } catch (e) {
    // Only swallow "not implemented" style failures.
    if (!(e instanceof HttpError && (e.status === 404 || e.status === 405))) {
      // other errors still allow fallback
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
      status: mapAgentStatus(a.status),
      lastSeenAt: a.lastActivityAt,
      currentTask: a.activeTask?.title,
      score: typeof a.healthScore === 'number' ? a.healthScore : typeof a.score === 'number' ? a.score : undefined
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
    leaderboard = (leaderboardSettled.value.data || []).map((r) => {
      const rawScore =
        typeof r.leaderboardScore === 'number'
          ? r.leaderboardScore
          : typeof r.score === 'number'
            ? r.score
            : 0

      return {
        agentId: r.agentId,
        name: r.displayName,
        points: Number.isFinite(rawScore) ? Number(rawScore.toFixed(1)) : 0
      }
    })
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
      timeline = recent.map((ev, idx) => {
        const kind = ev.kind
        const message = ev.summary || ev.title || kind || 'event'
        return {
          id: ev.eventId || ev.id || `${ev.at || ev.timestamp || 'na'}-${idx}`,
          ts: ev.timestamp || ev.at || new Date().toISOString(),
          title: ev.title || kind || 'event',
          detail: ev.summary,
          severity: pickSeverity(ev.severity, kind, message),
          meta: { kind }
        }
      })

      events = recent.map((ev, idx) => {
        const kind = ev.kind
        const message = ev.summary || ev.title || kind || 'event'
        return {
          id: ev.eventId || ev.id || `${ev.at || ev.timestamp || 'na'}-${idx}`,
          ts: ev.timestamp || ev.at || new Date().toISOString(),
          type: kind,
          title: ev.title,
          message,
          severity: pickSeverity(ev.severity, kind, message)
        }
      })

      const sourceStatus = detail.data?.sourceStatus || []
      for (const s of sourceStatus) {
        sources[`source:${s.name}`] = {
          health: v1SourceHealth(s.status),
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
