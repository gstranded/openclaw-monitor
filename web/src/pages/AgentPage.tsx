import { useEffect, useMemo, useRef, useState } from 'react'
import SectionCard from '../components/SectionCard'
import StatusBadge from '../components/StatusBadge'
import type { DashboardHealth } from '../lib/dashboardTypes'
import { API_BASE } from '../lib/config'
import { fetchJson, HttpError } from '../lib/fetchJson'

type Meta = {
  partial?: boolean
  collectedAt?: string
  degradeReasons?: string[]
  sourceLagMs?: number
}

type SourceState = {
  name: string
  status: 'ok' | 'degraded' | 'unavailable'
  message?: string
  collectedAt?: string
  updatedAt?: string | null
}

type TaskItem = {
  id: string
  title: string
  status?: string
  issue_url?: string
  priority?: string
  updated_at?: string
}

type EventItem = {
  id?: string
  at?: string
  kind?: string
  title?: string
  summary?: string
  severity?: 'info' | 'warning' | 'error'
}

type MarkdownFile = {
  fileId: string
  name: string
  path: string
  updatedAt?: string
  sizeBytes?: number
  writable?: boolean
}

type AgentDetail = {
  agentId: string
  displayName?: string
  emoji?: string
  role?: string
  score?: number
  status?: string
  lastActivityAt?: string | null
  activeTask?: {
    taskId?: string
    title?: string
    issueUrl?: string
    priority?: string
    status?: string
    updatedAt?: string | null
  } | null
  tasks?: TaskItem[]
  recentEvents?: EventItem[]
  sourceStatus?: SourceState[]
  markdownFiles?: MarkdownFile[]
}

type AgentDetailResponse = { data: AgentDetail; meta?: Meta }

function fmtTime(ts?: string | null) {
  if (!ts) return '—'
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ts
  return d.toLocaleString()
}

function healthFromMeta(meta?: Meta): DashboardHealth {
  if (meta?.partial) return 'partial'
  if ((meta?.degradeReasons || []).length) return 'degraded'
  return 'ok'
}

export default function AgentPage({ agentId }: { agentId: string }) {
  const [data, setData] = useState<AgentDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)

  const apiBaseLabel = useMemo(() => API_BASE, [])

  const meta = data?.meta
  const health = healthFromMeta(meta)

  async function loadOnce() {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    setError(null)

    try {
      const url = `${API_BASE.replace(/\/$/, '')}/agents/${encodeURIComponent(agentId)}`
      const res = await fetchJson<AgentDetailResponse>(url, { timeoutMs: 10_000, signal: controller.signal })
      setData(res)
      setLastUpdatedAt(new Date().toISOString())
      setError(null)
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
  }, [agentId])

  const agent = data?.data
  const markdownFiles = agent?.markdownFiles || []
  const recentEvents = agent?.recentEvents || []
  const tasks = agent?.tasks || []
  const sources = agent?.sourceStatus || []

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <div className="title">openclaw-monitor</div>
          <div className="subtitle">Agent detail</div>
        </div>

        <div className="controls">
          <div className="metaLine">
            <span className="muted">api</span>
            <code className="code">{apiBaseLabel}</code>
          </div>
          <div className="metaLine">
            <span className="muted">agent</span>
            <code className="code">{agentId}</code>
            <span className="sep">·</span>
            <StatusBadge health={health} />
            <span className="sep">·</span>
            <span className="muted">updated</span>
            <span>{fmtTime(lastUpdatedAt || meta?.collectedAt)}</span>
          </div>
          <div className="btnRow">
            <a className="btn" href="/">
              Back to dashboard
            </a>{' '}
            <button className="btn" onClick={() => void loadOnce()} disabled={loading}>
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>
      </header>

      {error ? (
        <div className="banner error">
          <div className="bannerTitle">Failed to load agent</div>
          <pre className="bannerBody">{error}</pre>
        </div>
      ) : null}

      {health === 'partial' || health === 'degraded' ? (
        <div className={`banner ${health === 'partial' ? 'partial' : 'degraded'}`}>
          <div className="bannerTitle">{health.toUpperCase()} data</div>
          <div className="bannerBody">
            Data may be incomplete.
            {(meta?.degradeReasons || []).length ? `\nreasons: ${(meta?.degradeReasons || []).join(', ')}` : ''}
          </div>
        </div>
      ) : null}

      <main className="grid">
        <SectionCard title="Summary" right={<span className="muted">/api/agents/:id</span>}>
          <div className="kvGrid">
            <KV k="display" v={`${agent?.emoji || ''} ${agent?.displayName || agent?.agentId || '—'}`} />
            <KV k="role" v={agent?.role || '—'} />
            <KV k="status" v={agent?.status || '—'} />
            <KV k="score" v={typeof agent?.score === 'number' ? String(agent?.score) : '—'} />
            <KV k="lastActivity" v={fmtTime(agent?.lastActivityAt)} />
            <KV k="activeTask" v={agent?.activeTask?.title || '—'} />
            <KV k="activeTask.status" v={agent?.activeTask?.status || '—'} />
            <KV k="activeTask.issue" v={agent?.activeTask?.issueUrl ? <a href={agent.activeTask.issueUrl}>{agent.activeTask.issueUrl}</a> : '—'} />
          </div>
        </SectionCard>

        <div className="gridCols2">
          <SectionCard title="Markdown allowlist" right={<a className="muted" href="/markdown">open</a>}>
            {markdownFiles.length ? (
              <ul className="list">
                {markdownFiles.map((f) => (
                  <li key={f.fileId} className="listItem">
                    <div className="listTop">
                      <span className="title">
                        <a href={`/markdown/${encodeURIComponent(f.fileId)}`}>{f.name}</a>
                      </span>
                      <span className="muted">{fmtTime(f.updatedAt)}</span>
                    </div>
                    <div className="detail muted">{f.path}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="empty">No allowlisted markdown files.</div>
            )}
          </SectionCard>

          <SectionCard title="Source status" right={<span className="muted">meta.partial = {String(meta?.partial ?? false)}</span>}>
            {sources.length ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>source</th>
                    <th>status</th>
                    <th>updated</th>
                    <th>message</th>
                  </tr>
                </thead>
                <tbody>
                  {sources.map((s) => (
                    <tr key={s.name}>
                      <td>{s.name}</td>
                      <td>{s.status}</td>
                      <td>{fmtTime(s.updatedAt || s.collectedAt)}</td>
                      <td className="muted">{s.message || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty">No source status.</div>
            )}
          </SectionCard>
        </div>

        <div className="gridCols2">
          <SectionCard title="Recent events" right={<span className="muted">latest 50</span>}>
            {recentEvents.length ? (
              <ul className="list">
                {recentEvents.slice(0, 20).map((ev, idx) => (
                  <li key={`${ev.at || idx}`} className={`listItem sev-${ev.severity === 'warning' ? 'warn' : ev.severity || 'info'}`}>
                    <div className="listTop">
                      <span className="ts">{fmtTime(ev.at)}</span>
                      <span className="title">{ev.title || ev.kind || 'event'}</span>
                    </div>
                    <div className="detail">{ev.summary || '—'}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="empty">No events.</div>
            )}
          </SectionCard>

          <SectionCard title="Tasks" right={<span className="muted">latest 50</span>}>
            {tasks.length ? (
              <ul className="list">
                {tasks.slice(0, 20).map((t) => (
                  <li key={t.id} className="listItem">
                    <div className="listTop">
                      <span className="title">{t.title}</span>
                      <span className="muted">{t.status || '—'}</span>
                    </div>
                    <div className="detail muted">
                      {t.issue_url ? (
                        <a href={t.issue_url} target="_blank" rel="noreferrer">
                          {t.issue_url}
                        </a>
                      ) : (
                        '—'
                      )}
                      {' · updated '}
                      {fmtTime(t.updated_at)}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="empty">No tasks.</div>
            )}
          </SectionCard>
        </div>
      </main>
    </div>
  )
}

function KV({ k, v }: { k: string; v: any }) {
  return (
    <div className="kvRow">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
    </div>
  )
}
