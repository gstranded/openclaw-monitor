import type { AgentSummary } from '../lib/dashboardTypes'

function statusLabel(s?: AgentSummary['status']) {
  if (s === 'online') return 'active'
  if (s === 'busy') return 'blocked'
  if (s === 'idle') return 'idle'
  if (s === 'offline') return 'offline'
  return 'unknown'
}

function statusTone(s?: AgentSummary['status']) {
  if (s === 'online') return 'ok'
  if (s === 'busy') return 'warn'
  if (s === 'offline') return 'bad'
  return 'muted'
}

export default function StaffSnapshot({ agents }: { agents: AgentSummary[] }) {
  if (!agents.length) return <div className="empty">No agents.</div>

  const online = agents.filter((a) => a.status === 'online').length
  const busy = agents.filter((a) => a.status === 'busy').length
  const offline = agents.filter((a) => a.status === 'offline').length

  const sorted = [...agents].sort((a, b) => {
    const prio = (s?: AgentSummary['status']) =>
      s === 'busy' ? 0 : s === 'online' ? 1 : s === 'idle' ? 2 : s === 'offline' ? 3 : 4
    const dp = prio(a.status) - prio(b.status)
    if (dp !== 0) return dp
    const at = a.currentTask ? 0 : 1
    const bt = b.currentTask ? 0 : 1
    if (at !== bt) return at - bt
    return (a.name || a.id).localeCompare(b.name || b.id)
  })

  const top = sorted.slice(0, 6)

  return (
    <div className="staff">
      <div className="staffCounts">
        <span className="pill">
          <span className="muted">active</span> {online}
        </span>
        <span className="pill">
          <span className="muted">blocked</span> {busy}
        </span>
        <span className="pill">
          <span className="muted">offline</span> {offline}
        </span>
      </div>

      <ul className="staffList">
        {top.map((a) => (
          <li key={a.id} className="staffRow">
            <a className="staffLink" href={`/agents/${encodeURIComponent(a.id)}`}>
              <span className="staffAvatar" aria-hidden>
                {a.emoji || '•'}
              </span>
              <span className="staffMain">
                <span className="staffName">{a.name || a.id}</span>
                <span className="staffRole">{a.role || '—'}</span>
                <span className={`staffStatus tone-${statusTone(a.status)}`}>{statusLabel(a.status)}</span>
              </span>
              <span className="staffTask" title={a.currentTask || ''}>
                {a.currentTask || '—'}
              </span>
            </a>
          </li>
        ))}
      </ul>

      <div className="staffHint muted">Click a name to open agent detail.</div>
    </div>
  )
}
