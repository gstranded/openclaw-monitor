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
}

export interface EventItem {
  id: string
  ts: string
  type?: string
  message: string
  severity?: 'info' | 'warn' | 'error'
}

export interface DashboardResponse {
  meta?: DashboardMeta
  agents?: AgentSummary[]
  leaderboard?: LeaderboardEntry[]
  timeline?: TimelineItem[]
  events?: EventItem[]
}
