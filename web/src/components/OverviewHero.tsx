import type { ReactNode } from 'react'
import type { AgentSummary, DashboardHealth, DashboardMeta, EventItem } from '../lib/dashboardTypes'
import StatusBadge from './StatusBadge'
import ThemeToggle from './ThemeToggle'
import StaffSnapshot from './StaffSnapshot'
import ActionableDigest from './ActionableDigest'

function fmtTime(ts?: string) {
  if (!ts) return '—'
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ts
  return d.toLocaleString()
}

function sourceSummary(meta?: DashboardMeta) {
  const sources = meta?.sources || {}
  const keys = Object.keys(sources)
  let worstMs = 0
  let bad = 0
  for (const k of keys) {
    const s = sources[k]
    if (typeof s?.freshnessMs === 'number') worstMs = Math.max(worstMs, s.freshnessMs)
    if (s?.health && s.health !== 'ok') bad++
  }
  return { total: keys.length, worstMs, bad }
}

function Pill({ children }: { children: ReactNode }) {
  return <span className="pill">{children}</span>
}

export default function OverviewHero({
  apiBase,
  meta,
  health,
  updatedAt,
  agents,
  events,
  loading,
  polling,
  onRefresh
}: {
  apiBase: string
  meta?: DashboardMeta
  health: DashboardHealth
  updatedAt?: string | null
  agents: AgentSummary[]
  events: EventItem[]
  loading?: boolean
  polling?: boolean
  onRefresh: () => void
}) {
  const s = sourceSummary(meta)
  const online = agents.filter((a) => a.status === 'online').length
  const busy = agents.filter((a) => a.status === 'busy').length

  return (
    <section className="heroCard">
      <div className="heroTop">
        <div>
          <div className="heroKicker">openclaw-monitor</div>
          <div className="heroTitle">Dashboard overview</div>
          <div className="heroSub muted">Health · Staff · Actionable digest</div>
        </div>

        <div className="heroActions">
          <button className="btn primary" onClick={onRefresh} disabled={!!loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          <ThemeToggle />
        </div>
      </div>

      <div className="heroMeta">
        <Pill>
          <span className="muted">api</span> <code className="code">{apiBase}</code>
        </Pill>
        <Pill>
          <span className="muted">updated</span> {fmtTime(updatedAt || meta?.generatedAt)}
        </Pill>
        <Pill>
          <StatusBadge health={health} />
          {polling ? <span className="muted">auto-updating…</span> : null}
        </Pill>
        <Pill>
          <span className="muted">staff</span> {online} active / {busy} blocked
        </Pill>
        <Pill>
          <span className="muted">sources</span> {s.bad}/{s.total} degraded
          {s.worstMs ? <span className="muted"> · worst lag {Math.round(s.worstMs / 1000)}s</span> : null}
        </Pill>
      </div>

      <div className="heroGrid">
        <div className="heroPanel">
          <div className="heroPanelTitle">System health</div>
          <div className="heroPanelBody">
            <div className="healthRow">
              <StatusBadge health={health} />
              <div className="muted">{meta?.health ? `health=${meta.health}` : 'health unknown'}</div>
            </div>
            <div className="healthHint muted">
              Worst lag is computed from source freshness; full details below in “Sources”.
            </div>
          </div>
        </div>

        <div className="heroPanel">
          <div className="heroPanelTitle">Staff snapshot</div>
          <div className="heroPanelBody">
            <StaffSnapshot agents={agents} />
          </div>
        </div>

        <div className="heroPanel">
          <div className="heroPanelTitle">Needs attention</div>
          <div className="heroPanelBody">
            <ActionableDigest events={events} />
          </div>
        </div>
      </div>
    </section>
  )
}
