import type { AgentSummary } from '../lib/dashboardTypes'

function fmtTime(ts?: string) {
  if (!ts) return '—'
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ts
  return d.toLocaleString()
}

export default function AgentCardsRow({ agents }: { agents: AgentSummary[] }) {
  if (!agents.length) return <div className="empty">No agents.</div>

  return (
    <div className="agentsRow" role="list">
      {agents.map((a) => (
        <article key={a.id} className="agentCard" role="listitem">
          <div className="agentTop">
            <div className="agentName">{a.name || a.id}</div>
            <div className={`agentStatus s-${a.status || 'unknown'}`}>{a.status || 'unknown'}</div>
          </div>
          <div className="agentMeta">
            <div className="kv">
              <span className="k">role</span>
              <span className="v">{a.role || '—'}</span>
            </div>
            <div className="kv">
              <span className="k">score</span>
              <span className="v">{typeof a.score === 'number' ? a.score : '—'}</span>
            </div>
            <div className="kv">
              <span className="k">last seen</span>
              <span className="v">{fmtTime(a.lastSeenAt)}</span>
            </div>
          </div>
          <div className="agentTask" title={a.currentTask || ''}>
            {a.currentTask ? a.currentTask : <span className="muted">No current task</span>}
          </div>
        </article>
      ))}
    </div>
  )
}
