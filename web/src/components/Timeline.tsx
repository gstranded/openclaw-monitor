import type { TimelineItem } from '../lib/dashboardTypes'

function fmt(ts: string) {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ts
  return d.toLocaleTimeString()
}

export default function Timeline({ items }: { items: TimelineItem[] }) {
  if (!items.length) return <div className="empty">No timeline items.</div>

  return (
    <ul className="list">
      {items.map((it) => (
        <li key={it.id} className={`listItem sev-${it.severity || 'info'}`}>
          <div className="listTop">
            <span className="ts">{fmt(it.ts)}</span>
            <span className="title">{it.title}</span>
          </div>
          {it.detail ? <div className="detail">{it.detail}</div> : null}
        </li>
      ))}
    </ul>
  )
}
