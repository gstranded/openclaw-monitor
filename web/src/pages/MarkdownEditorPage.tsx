import { useEffect, useMemo, useRef, useState } from 'react'
import SectionCard from '../components/SectionCard'
import StatusBadge from '../components/StatusBadge'
import type { DashboardHealth } from '../lib/dashboardTypes'
import { API_BASE } from '../lib/config'
import { fetchJson, HttpError } from '../lib/fetchJson'

type Meta = {
  partial?: boolean
  collectedAt?: string
  degradeReasons?: string[]
  allowlistRoot?: string
}

type ErrorEnvelope = {
  error: { code?: string; message?: string; retryable?: boolean; details?: any }
  meta?: Meta
}

type ReadData = { fileId: string; path: string; content: string; updatedAt?: string; bytes?: number }

type ReadResponse = { data: ReadData; meta?: Meta }

type PreviewData = {
  fileId: string
  path: string
  changed: boolean
  diff: string
  previousBytes?: number
  nextBytes?: number
}

type PreviewResponse = { data: PreviewData; meta?: Meta }

type SaveData = {
  fileId: string
  path: string
  saved: boolean
  changed: boolean
  diff: string
  updatedAt?: string
  bytes?: number
}

type SaveResponse = { data: SaveData; meta?: Meta }

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

function explain(e: any): string {
  if (!e) return 'Unknown error'
  if (typeof e === 'string') return e
  if (e?.error?.code || e?.error?.message) return `${e.error.code || 'ERROR'}: ${e.error.message || ''}`
  return e instanceof Error ? e.message : String(e)
}

function parseErrorEnvelope(bodyText?: string): { code?: string; message?: string } | null {
  if (!bodyText) return null
  try {
    const parsed = JSON.parse(bodyText)
    if (parsed?.error?.code || parsed?.error?.message) {
      return { code: parsed.error.code, message: parsed.error.message }
    }
    return null
  } catch {
    return null
  }
}

function formatHttpError(e: HttpError): string {
  const parsed = parseErrorEnvelope(e.bodyText)
  if (!parsed) return `${e.message}${e.bodyText ? `\n${e.bodyText}` : ''}`

  const code = parsed.code || 'ERROR'
  const msg = parsed.message || ''

  const hints: Record<string, string> = {
    CONFLICT: 'Conflict: content changed since load/preview. Click Reload, then re-apply changes and Save again.',
    FORBIDDEN_PATH: 'Forbidden: this path is not in the markdown allowlist.',
    NOT_FOUND: 'Not found: file is missing or fileId is invalid.'
  }

  return `${code}: ${msg}${hints[code] ? `\nHint: ${hints[code]}` : ''}`
}

export default function MarkdownEditorPage({ fileId }: { fileId: string }) {
  const [meta, setMeta] = useState<Meta | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string>('Loading…')
  const [originalContent, setOriginalContent] = useState<string>('')
  const [content, setContent] = useState<string>('')
  const [diff, setDiff] = useState<string>('(preview to see diff)')
  const [updatedAt, setUpdatedAt] = useState<string | undefined>(undefined)
  const [bytes, setBytes] = useState<number | undefined>(undefined)

  const abortRef = useRef<AbortController | null>(null)
  const apiBaseLabel = useMemo(() => API_BASE, [])

  const health = healthFromMeta(meta)

  async function readOnce() {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    setError(null)
    setStatus('Loading…')

    try {
      const url = `${API_BASE.replace(/\/$/, '')}/markdown/read?fileId=${encodeURIComponent(fileId)}`
      const res = await fetchJson<ReadResponse>(url, { timeoutMs: 10_000, signal: controller.signal })
      setMeta(res.meta)
      setOriginalContent(res.data.content)
      setContent(res.data.content)
      setUpdatedAt(res.data.updatedAt)
      setBytes(res.data.bytes)
      setDiff('(preview to see diff)')
      setStatus('OK · loaded')
    } catch (e) {
      if (controller.signal.aborted) return
      if (e instanceof HttpError) {
        setError(formatHttpError(e))
      } else if (e instanceof Error) {
        setError(e.message)
      } else {
        setError('Unknown error')
      }
      setStatus('Failed to load')
    } finally {
      setLoading(false)
    }
  }

  async function previewOnce() {
    setStatus('Previewing…')
    setError(null)
    try {
      const url = `${API_BASE.replace(/\/$/, '')}/markdown/preview`
      const res = await fetchJson<PreviewResponse>(url, {
        timeoutMs: 10_000,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId, content })
      })
      setMeta(res.meta)
      setDiff(res.data.diff)
      setStatus(res.data.changed ? 'OK · changed (ready to save)' : 'OK · no changes')
    } catch (e) {
      if (e instanceof HttpError) {
        setError(formatHttpError(e))
      } else {
        setError(explain(e))
      }
      setStatus('Preview failed')
    }
  }

  async function saveOnce() {
    setStatus('Saving…')
    setError(null)
    try {
      const url = `${API_BASE.replace(/\/$/, '')}/markdown/save`
      const res = await fetchJson<SaveResponse | ErrorEnvelope>(url, {
        timeoutMs: 10_000,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId, content, expectedContent: originalContent })
      })

      // if backend returns error envelope with 200 (shouldn't), handle anyway
      if ((res as any)?.error) {
        throw new Error(explain(res))
      }

      const okRes = res as SaveResponse
      setMeta(okRes.meta)
      setDiff(okRes.data.diff)
      setOriginalContent(content)
      setUpdatedAt(okRes.data.updatedAt)
      setBytes(okRes.data.bytes)
      setStatus(okRes.data.changed ? 'OK · saved (changed)' : 'OK · saved (no changes)')
    } catch (e) {
      if (e instanceof HttpError) {
        setError(formatHttpError(e))
      } else {
        setError(explain(e))
      }
      setStatus('Save failed')
    }
  }

  useEffect(() => {
    void readOnce()
    return () => abortRef.current?.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId])

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <div className="title">openclaw-monitor</div>
          <div className="subtitle">Markdown editor (allowlist)</div>
        </div>

        <div className="controls">
          <div className="metaLine">
            <span className="muted">api</span>
            <code className="code">{apiBaseLabel}</code>
          </div>
          <div className="metaLine">
            <span className="muted">file</span>
            <code className="code">{fileId}</code>
          </div>
          <div className="metaLine">
            <StatusBadge health={health} />
            <span className="sep">·</span>
            <span className="muted">updated</span>
            <span>{fmtTime(updatedAt || meta?.collectedAt)}</span>
          </div>
          <div className="btnRow">
            <a className="btn" href="/markdown">
              Back to list
            </a>{' '}
            <button className="btn" onClick={() => void readOnce()} disabled={loading}>
              {loading ? 'Loading…' : 'Reload'}
            </button>
          </div>
        </div>
      </header>

      {error ? (
        <div className="banner error">
          <div className="bannerTitle">Markdown operation failed</div>
          <pre className="bannerBody">{error}</pre>
        </div>
      ) : null}

      {health === 'partial' || health === 'degraded' ? (
        <div className={`banner ${health === 'partial' ? 'partial' : 'degraded'}`}>
          <div className="bannerTitle">{health.toUpperCase()} data</div>
          <div className="bannerBody">
            Data may be incomplete.
            {(meta?.degradeReasons || []).length ? `\nreasons: ${(meta?.degradeReasons || []).join(', ')}` : ''}
          </div>
        </div>
      ) : null}

      <main className="grid">
        <SectionCard title="Editor" right={<span className="muted">{status}</span>}>
          <div className="editorRow">
            <button className="btn" onClick={() => void previewOnce()} disabled={loading}>
              Preview diff
            </button>
            <button className="btn" onClick={() => void saveOnce()} disabled={loading}>
              Save
            </button>
            <span className="muted">
              bytes: {typeof bytes === 'number' ? bytes : '—'} · expectedContent guard enabled
            </span>
          </div>

          <textarea
            className="mdTextarea"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            spellCheck={false}
          />

          <div style={{ height: 10 }} />
          <div className="muted">Diff</div>
          <pre className="diffBox">{diff}</pre>
        </SectionCard>
      </main>
    </div>
  )
}
