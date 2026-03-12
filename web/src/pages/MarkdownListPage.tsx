import { useEffect, useMemo, useRef, useState } from 'react'
import SectionCard from '../components/SectionCard'
import StatusBadge from '../components/StatusBadge'
import ThemeToggle from '../components/ThemeToggle'
import type { DashboardHealth } from '../lib/dashboardTypes'
import { API_BASE } from '../lib/config'
import { fetchJson, HttpError } from '../lib/fetchJson'

type Meta = {
  partial?: boolean
  collectedAt?: string
  degradeReasons?: string[]
  allowlistRoot?: string
  allowlistCount?: number
}

type MarkdownFile = {
  fileId: string
  name: string
  path: string
  updatedAt?: string
  sizeBytes?: number
  writable?: boolean
}

type FilesResponse = { data: MarkdownFile[]; meta?: Meta }

function fmtTime(ts?: string) {
  if (!ts) return '—'
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ts
  return d.toLocaleString()
}

function healthFromMeta(meta?: Meta): DashboardHealth {
  if (meta?.partial) return 'partial'
  if ((meta?.degradeReasons || []).length) return 'degraded'
  return 'ok'
}

export default function MarkdownListPage() {
  const [data, setData] = useState<FilesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const apiBaseLabel = useMemo(() => API_BASE, [])

  const meta = data?.meta
  const health = healthFromMeta(meta)

  async function loadOnce() {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    setError(null)

    try {
      const url = `${API_BASE.replace(/\/$/, '')}/markdown/files`
      const res = await fetchJson<FilesResponse>(url, { timeoutMs: 10_000, signal: controller.signal })
      setData(res)
      setLastUpdatedAt(new Date().toISOString())
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
    }
  }

  useEffect(() => {
    void loadOnce()
    return () => abortRef.current?.abort()
  }, [])

  const files = data?.data || []

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <div className="title">openclaw-monitor</div>
          <div className="subtitle">Markdown</div>
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
            <StatusBadge health={health} />
            <span className="sep">·</span>
            <span className="muted">updated</span>
            <span>{fmtTime(lastUpdatedAt || meta?.collectedAt)}</span>
          </div>
          <div className="btnRow">
            <a className="btn" href="/">
              ← Dashboard
            </a>{' '}
            <button className="btn primary" onClick={() => void loadOnce()} disabled={loading}>
              {loading ? 'Loading…' : 'Refresh'}
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {error ? (
        <div className="banner error">
          <div className="bannerTitle">Failed to load markdown files</div>
          <pre className="bannerBody">{error}</pre>
        </div>
      ) : null}

      {health === 'partial' || health === 'degraded' ? (
        <div className={`banner ${health === 'partial' ? 'partial' : 'degraded'}`}>
          <div className="bannerTitle">{health.toUpperCase()} data</div>
          <div className="bannerBody">Some sources are stale/unavailable. UI should still be usable.</div>
        </div>
      ) : null}

      <main className="grid">
        <SectionCard
          title="Files"
          right={
            <span className="muted">
              allowlistRoot={meta?.allowlistRoot || 'docs'} · count={meta?.allowlistCount ?? files.length}
            </span>
          }
        >
          {files.length ? (
            <ul className="list">
              {files.map((f) => (
                <li key={f.fileId} className="listItem">
                  <div className="listTop">
                    <span className="title">
                      <a href={`/markdown/${encodeURIComponent(f.fileId)}`}>{f.name}</a>
                    </span>
                    <span className="muted">{fmtTime(f.updatedAt)}</span>
                  </div>
                  <div className="detail muted">
                    {f.path} · {typeof f.sizeBytes === 'number' ? `${Math.round(f.sizeBytes / 1024)} KB` : '—'} ·{' '}
                    {f.writable ? 'writable' : 'read-only'}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty">No allowlisted files.</div>
          )}
        </SectionCard>

        <SectionCard title="Notes" right={<span className="muted">安全边界</span>}>
          <div className="empty">
            Only allowlisted markdown files can be read/saved. Out-of-scope paths should surface a clear
            FORBIDDEN_PATH error.
          </div>
        </SectionCard>
      </main>
    </div>
  )
}
