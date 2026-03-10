import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import SectionCard from '../components/SectionCard'
import Timeline from '../components/Timeline'
import { HttpError } from '../lib/fetchJson'
import { loadAgentDetail, type AgentDetail } from '../lib/agentApi'

function fmtTime(ts?: string) {
  if (!ts) return '—'
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ts
  return d.toLocaleString()
}

export default function AgentDetailPage() {
  const { id } = useParams()
  const agentId = id || ''

  const [data, setData] = useState<AgentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    async function run() {
      setLoading(true)
      setError(null)
      try {
        const res = await loadAgentDetail(agentId, { signal: controller.signal })
        setData(res)
      } catch (e) {
        if (controller.signal.aborted) return
        if (e instanceof HttpError) setError(`${e.message}${e.bodyText ? `\n${e.bodyText}` : ''}`)
        else if (e instanceof Error) setError(e.message)
        else setError('Unknown error')
      } finally {
        setLoading(false)
      }
    }

    if (agentId) void run()

    return () => controller.abort()
  }, [agentId])

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <div className="title">Agent Detail</div>
          <div className="subtitle">
            <Link to="/" className="link">
              ← Back to Dashboard
            </Link>
          </div>
        </div>

        <div className="controls">
          <div className="metaLine">
            <span className="muted">agent</span>
            <code className="code">{agentId}</code>
          </div>
          <div className="metaLine">
            <span className="muted">updated</span>
            <span>{fmtTime(data?.lastActivityAt)}</span>
          </div>
        </div>
      </header>

      {error ? (
        <div className="banner error">
          <div className="bannerTitle">Failed to load agent detail</div>
          <pre className="bannerBody">{error}</pre>
        </div>
      ) : null}

      <main className="grid">
        <SectionCard title="Summary" right={loading ? <span className="muted">Loading…</span> : null}>
          {data ? (
            <div className="kvGrid">
              <div className="kv"><span className="k">name</span><span className="v">{data.name}</span></div>
              <div className="kv"><span className="k">role</span><span className="v">{data.role || '—'}</span></div>
              <div className="kv"><span className="k">status</span><span className="v">{data.status || '—'}</span></div>
              <div className="kv"><span className="k">model</span><span className="v">{data.currentModel || '—'}</span></div>
              <div className="kv"><span className="k">branch</span><span className="v">{data.currentBranch || '—'}</span></div>
              <div className="kv"><span className="k">task</span><span className="v">{data.activeTaskTitle || '—'}</span></div>
            </div>
          ) : (
            <div className="empty">{loading ? 'Loading…' : 'No data'}</div>
          )}
        </SectionCard>

        <div className="gridCols">
          <div className="col">
            <SectionCard title="Recent Events" right={<span className="muted">last 20</span>}>
              <Timeline
                items={(data?.recentEvents || []).map((e) => ({
                  id: e.id,
                  ts: e.ts,
                  title: e.title,
                  detail: e.summary,
                  severity: e.severity
                }))}
              />
            </SectionCard>
          </div>

          <div className="col" style={{ gridColumn: 'span 2' }}>
            <SectionCard title="Sources" right={<span className="muted">collector health</span>}>
              <SourcesTable sources={data?.sourceStatus} />
            </SectionCard>
          </div>
        </div>
      </main>
    </div>
  )
}

function SourcesTable({
  sources
}: {
  sources: Array<{ name: string; status: 'ok' | 'degraded' | 'unavailable'; message?: string }> | undefined
}) {
  if (!sources?.length) return <div className="empty">No source metadata.</div>

  return (
    <table className="table">
      <thead>
        <tr>
          <th>source</th>
          <th>status</th>
          <th>message</th>
        </tr>
      </thead>
      <tbody>
        {sources.map((s) => (
          <tr key={s.name}>
            <td>{s.name}</td>
            <td>{s.status}</td>
            <td className="muted">{s.message || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
