import type { TimelineItem } from '../lib/dashboardTypes'

function fmtTime(ts: string) {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ts
  return d.toLocaleTimeString()
}

function fmtDay(ts: string) {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ts
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function Timeline({ items, loading }: { items: TimelineItem[]; loading?: boolean }) {
  if (loading && !items.length) return <div className="empty">Loading timeline…</div>
  if (!items.length) return <div className="empty">No timeline items.</div>

  const sorted = [...items].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())

  const groups: Array<{ day: string; items: TimelineItem[] }> = []
  const map = new Map<string, TimelineItem[]>()

  for (const it of sorted) {
    const day = fmtDay(it.ts)
    const arr = map.get(day) || []
    arr.push(it)
    map.set(day, arr)
  }

  for (const [day, arr] of map.entries()) {
    groups.push({ day, items: arr })
  }

  groups.sort((a, b) => (a.day < b.day ? 1 : -1))

  return (
    <div className="timeline">
      {groups.map((g) => (
        <section key={g.day} className="dayGroup">
          <div className="dayHeader">
            <span className="day">{g.day}</span>
            <span className="muted">{g.items.length}</span>
          </div>

          <ul className="list compact">
            {g.items.map((it) => (
              <li key={it.id} className={`listItem sev-${it.severity || 'info'}`}>
                <div className="listTop">
                  <span className="ts">{fmtTime(it.ts)}</span>
                  <span className="title">{it.title}</span>
                  <span className="chips">
                    {it.meta?.agentId ? <span className="chip">{it.meta.agentId}</span> : null}
                    {it.meta?.kind ? <span className="chip">{it.meta.kind}</span> : null}
                    {it.meta?.issueUrl ? (
                      <a className="chip linkChip" href={it.meta.issueUrl} target="_blank" rel="noreferrer">
                        issue
                      </a>
                    ) : null}
                  </span>
                </div>
                {it.detail ? <div className="detail">{it.detail}</div> : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
