import type { EventItem } from '../lib/dashboardTypes'

function fmt(ts: string) {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ts
  return d.toLocaleTimeString()
}

export default function EventStream({ items }: { items: EventItem[] }) {
  if (!items.length) return <div className="empty">No events.</div>

  return (
    <ul className="list">
      {items.map((it) => (
        <li key={it.id} className={`listItem sev-${it.severity || 'info'}`}>
          <div className="listTop">
            <span className="ts">{fmt(it.ts)}</span>
            <span className="title">{it.type ? `[${it.type}] ` : ''}{it.message}</span>
          </div>
        </li>
      ))}
    </ul>
  )
}
