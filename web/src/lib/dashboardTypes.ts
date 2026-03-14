export type DashboardHealth = 'ok' | 'partial' | 'degraded' | 'error' | 'unknown'

export type AgentStatus = 'online' | 'idle' | 'busy' | 'offline' | 'unknown'

export interface DashboardMeta {
  generatedAt?: string
  health?: DashboardHealth
  /** optional per-source status from backend */
  sources?: Record<
    string,
    {
      health?: DashboardHealth
      freshnessMs?: number
      message?: string
    }
  >
}

export interface AgentSummary {
  id: string
  name: string
  emoji?: string
  role?: string
  status?: AgentStatus
  lastSeenAt?: string
  currentTask?: string
  score?: number
}

export interface LeaderboardEntry {
  agentId?: string
  name: string
  points: number
  delta24h?: number
}

export interface TimelineItem {
  id: string
  ts: string
  title: string
  detail?: string
  severity?: 'info' | 'warn' | 'error'
  meta?: {
    agentId?: string
    kind?: string
    taskTitle?: string
    issueUrl?: string
  }
}

export interface EventItem {
  id: string
  ts: string
  /** backend kind/type */
  type?: string
  agentId?: string
  title?: string
  /** human-readable summary/message */
  message: string
  /** optional long-form context (e.g. blocker reason) */
  detail?: string
  severity?: 'info' | 'warn' | 'error'
}

export interface DashboardResponse {
  meta?: DashboardMeta
  agents?: AgentSummary[]
  leaderboard?: LeaderboardEntry[]
  timeline?: TimelineItem[]
  events?: EventItem[]
}
