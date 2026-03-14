import type { EventItem } from '../lib/dashboardTypes'
import Linkify from './Linkify'

function fmtRelative(ts: string) {
  const d = new Date(ts)
  const ms = d.getTime()
  if (!Number.isFinite(ms)) return ts
  const diff = Date.now() - ms
  const m = Math.round(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 48) return `${h}h ago`
  const day = Math.round(h / 24)
  return `${day}d ago`
}

export default function ActionableDigest({ events }: { events: EventItem[] }) {
  if (!events.length) return <div className="empty">No events.</div>

  const actionable = events.filter((e) => (e.severity || 'info') !== 'info')
  const picked = (actionable.length ? actionable : events).slice(0, 6)

  return (
    <div className="digest">
      <ul className="digestList">
        {picked.map((e) => (
          <li key={e.id} className={`digestItem sev-${e.severity || 'info'}`}>
            <div className="digestTop">
              <span className="digestTitle">{e.title || e.type || 'event'}</span>
              <span className="muted">{fmtRelative(e.ts)}</span>
            </div>
            <div className="digestMsg">
              <Linkify text={e.message} />
            </div>
            <div className="digestMeta">
              {e.severity ? <span className={`chip sev-${e.severity}`}>{e.severity}</span> : null}
              {e.agentId ? <span className="chip">{e.agentId}</span> : null}
              {e.type ? <span className="chip">{e.type}</span> : null}
            </div>
          </li>
        ))}
      </ul>

      <div className="digestHint muted">Showing {picked.length} most recent {actionable.length ? 'warn/error' : ''} items.</div>
    </div>
  )
}
