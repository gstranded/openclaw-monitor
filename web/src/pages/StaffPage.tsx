import { useEffect, useMemo, useRef, useState } from 'react'
import CompactRow from '../components/CompactRow'
import EmptyState from '../components/EmptyState'
import SectionCard from '../components/SectionCard'
import StatusBadge from '../components/StatusBadge'
import StatusPill, { type StaffState } from '../components/StatusPill'
import ThemeToggle from '../components/ThemeToggle'
import type { AgentSummary, DashboardHealth, DashboardResponse } from '../lib/dashboardTypes'
import { API_BASE } from '../lib/config'
import { HttpError, fetchJson } from '../lib/fetchJson'
import { loadDashboardSnapshot } from '../lib/dashboardApi'

type AgentDetail = {
  agentId: string
  activeTask?: { taskId?: string; title?: string } | null
  tasks?: { id: string; title: string; status?: string; updated_at?: string; issue_url?: string }[]
}

type AgentDetailEnvelope = { data: AgentDetail; meta?: { partial?: boolean; degradeReasons?: string[] } }

type StaffRow = {
  agent: AgentSummary
  staffState: StaffState
  current: string | null
  next: string | null
  lastActiveAt?: string
  evidenceUrl?: string
  detailPartial?: boolean
}

function safeHealth(h?: string): DashboardHealth {
  if (h === 'ok' || h === 'partial' || h === 'degraded' || h === 'error') return h
  return 'unknown'
}

function fmtTime(ts?: string) {
  if (!ts) return '—'
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ts
  return d.toLocaleString()
}

function toStaffState(agent: AgentSummary, hasBacklog: boolean): StaffState {
  const status = agent.status || 'unknown'

  if (status === 'offline') return 'offline'

  // Working: has current task and looks online/busy.
  if (agent.currentTask && (status === 'online' || status === 'busy')) return 'working'

  // Standby: has backlog but no live signal.
  if (hasBacklog) return 'standby'

  // Idle: no backlog and no current task.
  if (!agent.currentTask) return 'idle'

  return 'unknown'
}

function pickNextTaskTitle(detail?: AgentDetail | null): { next: string | null; evidenceUrl?: string; hasBacklog: boolean } {
  if (!detail) return { next: null, hasBacklog: false }

  const activeId = detail.activeTask?.taskId
  const tasks = Array.isArray(detail.tasks) ? detail.tasks : []

  const backlog = tasks.filter((t) => t.status === 'todo' || t.status === 'blocked')
  const hasBacklog = backlog.length > 0

  const candidates = backlog
    .filter((t) => !activeId || t.id !== activeId)
    .sort((a, b) => {
      const aAt = a.updated_at ? new Date(a.updated_at).getTime() : 0
      const bAt = b.updated_at ? new Date(b.updated_at).getTime() : 0
      return bAt - aAt
    })

  const next = candidates[0]
  return { next: next?.title ?? null, evidenceUrl: next?.issue_url, hasBacklog }
}

export default function StaffPage() {
  const [data, setData] = useState<DashboardResponse | null>(null)
  const [details, setDetails] = useState<Record<string, AgentDetailEnvelope | null>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)

  const health = safeHealth(data?.meta?.health)
  const apiBaseLabel = useMemo(() => API_BASE, [])

  async function loadOnce() {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    setError(null)

    try {
      const snapshot = await loadDashboardSnapshot({ signal: controller.signal })
      setData(snapshot)
      setLastUpdatedAt(new Date().toISOString())

      // best-effort: fetch per-agent details for "next" backlog summary (concurrency-limited).
      const agents = snapshot.agents || []
      const limit = Math.min(agents.length, 30)
      const ids = agents.slice(0, limit).map((a) => a.id)

      const nextDetails: Record<string, AgentDetailEnvelope | null> = {}

      const concurrency = 4
      let i = 0

      async function worker() {
        while (i < ids.length) {
          const idx = i
          i += 1
          const id = ids[idx]

          try {
            const url = `${API_BASE.replace(/\/$/, '')}/agents/${encodeURIComponent(id)}`
            const res = await fetchJson<AgentDetailEnvelope>(url, { timeoutMs: 10_000, signal: controller.signal })
            nextDetails[id] = res
          } catch {
            nextDetails[id] = null
          }
        }
      }

      await Promise.all(Array.from({ length: concurrency }).map(() => worker()))

      setDetails(nextDetails)
    } catch (e) {
      if (controller.signal.aborted) return

      if (e instanceof HttpError) {
        setError(`${e.message}${e.bodyText ? `\n${e.bodyText}` : ''}`)
      } else if (e instanceof Error) {
        setError(e.message)
      } else {
        setError('Unknown error')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadOnce()
    return () => abortRef.current?.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const agents = data?.agents ?? []

  const rows: StaffRow[] = agents.map((agent) => {
    const detailEnv = details[agent.id]
    const detail = detailEnv?.data
    const { next, evidenceUrl, hasBacklog } = pickNextTaskTitle(detail)

    return {
      agent,
      staffState: toStaffState(agent, hasBacklog),
      current: agent.currentTask ?? null,
      next,
      lastActiveAt: agent.lastSeenAt,
      evidenceUrl,
      detailPartial: !!detailEnv?.meta?.partial
    }
  })

  const counts = rows.reduce(
    (acc, r) => {
      acc[r.staffState] = (acc[r.staffState] || 0) + 1
      return acc
    },
    {} as Record<string, number>
  )

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <div className="title">openclaw-monitor</div>
          <div className="subtitle">Staff</div>
          <nav className="nav">
            <a className="navLink" href="/">🏠 Dashboard</a>
            <a className="navLink" href="/staff">🧑‍💼 Staff</a>
            <a className="navLink" href="/markdown">📝 Markdown</a>
          </nav>
        </div>

        <div className="controls">
          <div className="metaLine">
            <span className="muted">api</span>
            <code className="code">{apiBaseLabel}</code>
          </div>
          <div className="metaLine">
            <span className="muted">updated</span>
            <span>{fmtTime(lastUpdatedAt || data?.meta?.generatedAt)}</span>
            <span className="sep">·</span>
            <StatusBadge health={health} />
          </div>
          <div className="btnRow">
            <button className="btn primary" onClick={() => void loadOnce()} disabled={loading}>
              {loading ? 'Loading…' : 'Refresh'}
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {error ? (
        <div className="banner error">
          <div className="bannerTitle">Failed to load staff</div>
          <pre className="bannerBody">{error}</pre>
        </div>
      ) : null}

      {health === 'partial' || health === 'degraded' ? (
        <div className={`banner ${health === 'partial' ? 'partial' : 'degraded'}`}>
          <div className="bannerTitle">{health.toUpperCase()} data</div>
          <div className="bannerBody">
            部分数据源未接线或降级：Working/Standby/Idle 可能为 best-effort 推断；缺字段会显示 “—”，不会显示假 0。
          </div>
        </div>
      ) : null}

      <main className="grid">
        <SectionCard
          title="Staff view"
          right={
            <span className="muted">
              working {counts.working || 0} · standby {counts.standby || 0} · idle {counts.idle || 0} · offline{' '}
              {counts.offline || 0}
            </span>
          }
        >
          {!rows.length ? (
            <EmptyState
              title="No agents"
              detail="未获取到 agent 列表：可能 OPENCLAW_RUNTIME_DIR 未指向 runtime 快照目录，或数据源暂不可用。"
              action={
                <a className="btn ghost" href="/">
                  Back to dashboard
                </a>
              }
            />
          ) : (
            <div className="staffTable">
              <div className="staffHeader">
                <div>Agent</div>
                <div>Status</div>
                <div>Current</div>
                <div>Next</div>
                <div>Last active</div>
                <div>Links</div>
              </div>

              {rows.map((r) => (
                <div key={r.agent.id} className="staffRow">
                  <div className="staffAgent">
                    <div className="staffName">{r.agent.name || r.agent.id}</div>
                    <div className="muted staffSub">{r.agent.role || '—'}</div>
                  </div>

                  <div>
                    <StatusPill state={r.staffState} />
                    {r.detailPartial ? <span className="muted" style={{ marginLeft: 8 }} title="detail meta.partial">partial</span> : null}
                  </div>

                  <div className="staffText" title={r.current || ''}>{r.current || <span className="muted">—</span>}</div>
                  <div className="staffText" title={r.next || ''}>{r.next || <span className="muted">—</span>}</div>
                  <div className="muted">{fmtTime(r.lastActiveAt)}</div>

                  <div className="staffLinks">
                    <CompactRow
                      href={`/agents/${encodeURIComponent(r.agent.id)}`}
                      left={<span>详情</span>}
                      right={<span className="muted">/agents</span>}
                    />
                    {r.evidenceUrl ? (
                      <CompactRow href={r.evidenceUrl} left={<span>证据</span>} right={<span className="muted">issue</span>} />
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </main>
    </div>
  )
}
