import { useMemo, useState } from 'react'
import type { EventItem } from '../lib/dashboardTypes'

function fmt(ts: string) {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ts
  return d.toLocaleString()
}

function norm(s: string) {
  return s.trim().toLowerCase()
}

type GroupBy = 'agent' | 'kind' | 'none'

type Severity = 'all' | 'info' | 'warn' | 'error'

export default function EventStream({ items, loading }: { items: EventItem[]; loading?: boolean }) {
  const [groupBy, setGroupBy] = useState<GroupBy>('agent')
  const [severity, setSeverity] = useState<Severity>('all')
  const [agent, setAgent] = useState<string>('all')
  const [kind, setKind] = useState<string>('all')
  const [q, setQ] = useState<string>('')

  const agents = useMemo(() => {
    const set = new Set<string>()
    for (const it of items) if (it.agentId) set.add(it.agentId)
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [items])

  const kinds = useMemo(() => {
    const set = new Set<string>()
    for (const it of items) if (it.type) set.add(it.type)
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [items])

  const filtered = useMemo(() => {
    const nq = norm(q)
    return items.filter((it) => {
      if (severity !== 'all' && (it.severity || 'info') !== severity) return false
      if (agent !== 'all' && (it.agentId || 'unknown') !== agent) return false
      if (kind !== 'all' && (it.type || 'unknown') !== kind) return false
      if (nq) {
        const hay = norm(`${it.agentId || ''} ${it.type || ''} ${it.title || ''} ${it.message || ''}`)
        if (!hay.includes(nq)) return false
      }
      return true
    })
  }, [items, severity, agent, kind, q])

  const groups = useMemo(() => {
    const map = new Map<string, EventItem[]>()
    for (const it of filtered) {
      const key =
        groupBy === 'agent'
          ? it.agentId || 'unknown'
          : groupBy === 'kind'
            ? it.type || 'unknown'
            : 'all'

      const arr = map.get(key) || []
      arr.push(it)
      map.set(key, arr)
    }

    const out = Array.from(map.entries()).map(([key, arr]) => {
      // ensure newest first within group
      arr.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
      return { key, items: arr }
    })

    // sort groups by newest event time
    out.sort((a, b) => {
      const aMs = a.items[0] ? new Date(a.items[0].ts).getTime() : 0
      const bMs = b.items[0] ? new Date(b.items[0].ts).getTime() : 0
      return bMs - aMs
    })

    return out
  }, [filtered, groupBy])

  if (loading && !items.length) return <div className="empty">Loading events…</div>
  if (!items.length) return <div className="empty">No events.</div>

  return (
    <div className="panel">
      <div className="panelControls" role="group" aria-label="event controls">
        <label className="ctl">
          <span className="ctlLabel">group</span>
          <select className="select" value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)}>
            <option value="agent">agent</option>
            <option value="kind">kind</option>
            <option value="none">none</option>
          </select>
        </label>

        <label className="ctl">
          <span className="ctlLabel">sev</span>
          <select className="select" value={severity} onChange={(e) => setSeverity(e.target.value as Severity)}>
            <option value="all">all</option>
            <option value="info">info</option>
            <option value="warn">warn</option>
            <option value="error">error</option>
          </select>
        </label>

        <label className="ctl">
          <span className="ctlLabel">agent</span>
          <select className="select" value={agent} onChange={(e) => setAgent(e.target.value)}>
            <option value="all">all</option>
            {agents.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>

        <label className="ctl">
          <span className="ctlLabel">kind</span>
          <select className="select" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="all">all</option>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>

        <label className="ctl grow">
          <span className="ctlLabel">search</span>
          <input
            className="input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title/summary…"
          />
        </label>

        <div className="ctlSummary">
          <span className="muted">showing</span> {filtered.length}
        </div>
      </div>

      {filtered.length === 0 ? <div className="empty">No events match filters.</div> : null}

      <div className="groups">
        {groups.map((g) => (
          <details key={g.key} className="group" open>
            <summary className="groupSummary">
              <span className="groupKey">{groupBy === 'none' ? 'All events' : g.key}</span>
              <span className="muted">{g.items.length}</span>
              {g.items[0] ? <span className="muted">· {fmt(g.items[0].ts)}</span> : null}
            </summary>

            <ul className="list compact">
              {g.items.map((it) => (
                <li key={it.id} className={`listItem sev-${it.severity || 'info'}`}>
                  <div className="eventRow">
                    <span className="ts">{fmt(it.ts)}</span>

                    <span className="chips">
                      {it.severity ? <span className={`chip sev-${it.severity}`}>{it.severity}</span> : null}
                      {it.agentId ? <span className="chip">{it.agentId}</span> : null}
                      {it.type ? <span className="chip">{it.type}</span> : null}
                    </span>

                    <div className="eventText">
                      <div className="eventTitle">{it.title || it.type || 'event'}</div>
                      <div className="eventSummary">{it.message}</div>
                      {it.detail ? <pre className="eventDetail">{it.detail}</pre> : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </div>
  )
}
