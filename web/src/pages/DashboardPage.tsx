import { useEffect, useMemo, useRef, useState } from 'react'
import AgentCardsRow from '../components/AgentCardsRow'
import EventStream from '../components/EventStream'
import Leaderboard from '../components/Leaderboard'
import SectionCard from '../components/SectionCard'
import StatusBadge from '../components/StatusBadge'
import ThemeToggle from '../components/ThemeToggle'
import Timeline from '../components/Timeline'
import type { DashboardHealth, DashboardResponse } from '../lib/dashboardTypes'
import { HttpError } from '../lib/fetchJson'
import { API_BASE, DASHBOARD_POLL_MS } from '../lib/config'
import { loadDashboardSnapshot } from '../lib/dashboardApi'

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

export default function DashboardPage() {
  const [data, setData] = useState<DashboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null)
  const [polling, setPolling] = useState(false)

  const abortRef = useRef<AbortController | null>(null)

  const health = safeHealth(data?.meta?.health)

  const apiBaseLabel = useMemo(() => API_BASE, [])

  async function loadOnce({ silent }: { silent: boolean }) {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    if (!silent) {
      setLoading(true)
      setError(null)
    } else {
      setPolling(true)
    }

    try {
      const res = await loadDashboardSnapshot({ signal: controller.signal })
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
      setPolling(false)
    }
  }

  useEffect(() => {
    void loadOnce({ silent: false })

    const id = window.setInterval(() => {
      void loadOnce({ silent: true })
    }, DASHBOARD_POLL_MS)

    return () => {
      window.clearInterval(id)
      abortRef.current?.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const agents = data?.agents ?? []
  const leaderboard = data?.leaderboard ?? []
  const timeline = data?.timeline ?? []
  const events = data?.events ?? []

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <div className="title">openclaw-monitor</div>
          <div className="subtitle">Dashboard</div>
          <nav className="nav">
            <a className="navLink" href="/">🏠 Dashboard</a>
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
            {polling ? <span className="muted">auto-updating…</span> : null}
          </div>
          <div className="btnRow">
            <button className="btn primary" onClick={() => void loadOnce({ silent: false })} disabled={loading}>
              {loading ? 'Loading…' : 'Refresh'}
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {error ? (
        <div className="banner error">
          <div className="bannerTitle">Failed to load dashboard</div>
          <pre className="bannerBody">{error}</pre>
          <div className="bannerHint">
            We still tried a real API call. When backend is not ready yet, this is expected.
          </div>
        </div>
      ) : null}

      {health === 'partial' || health === 'degraded' ? (
        <div className={`banner ${health === 'partial' ? 'partial' : 'degraded'}`}>
          <div className="bannerTitle">{health.toUpperCase()} data</div>
          <div className="bannerBody">
            Some sources are stale or unavailable. UI should remain usable and clearly indicate limitations.
          </div>
        </div>
      ) : null}

      <main className="grid">
        <div className="gridTop">
          <SectionCard title="Agents" right={<span className="muted">{agents.length} total</span>}>
            <AgentCardsRow agents={agents} />
          </SectionCard>
        </div>

        <div className="gridCols">
          <div className="col">
            <SectionCard title="Timeline" right={<span className="muted">Activity log</span>}>
              <Timeline items={timeline} />
            </SectionCard>
          </div>

          <div className="col">
            <SectionCard title="Leaderboard" right={<span className="muted">Points</span>}>
              <Leaderboard rows={leaderboard} />
            </SectionCard>
          </div>

          <div className="col">
            <SectionCard title="Event Stream" right={<span className="muted">Realtime-ish</span>}>
              <EventStream items={events} />
            </SectionCard>
          </div>
        </div>

        <SectionCard title="Sources" right={<span className="muted">freshness & health</span>}>
          <SourcesTable sources={data?.meta?.sources} />
        </SectionCard>
      </main>
    </div>
  )
}

function SourcesTable({
  sources
}: {
  sources:
    | Record<string, { health?: DashboardHealth; freshnessMs?: number; message?: string }>
    | undefined
}) {
  const keys = Object.keys(sources || {})
  if (!keys.length) return <div className="empty">No source metadata.</div>

  return (
    <table className="table">
      <thead>
        <tr>
          <th>source</th>
          <th>health</th>
          <th>freshness</th>
          <th>message</th>
        </tr>
      </thead>
      <tbody>
        {keys.map((k) => (
          <tr key={k}>
            <td>{k}</td>
            <td>{sources?.[k]?.health || 'unknown'}</td>
            <td>
              {typeof sources?.[k]?.freshnessMs === 'number'
                ? `${Math.round((sources?.[k]?.freshnessMs || 0) / 1000)}s`
                : '—'}
            </td>
            <td className="muted">{sources?.[k]?.message || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
