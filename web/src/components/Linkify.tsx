import type { ReactNode } from 'react'

// Very small URL linkifier for logs/event summaries.
// - only http/https
// - intentionally conservative (no markdown parsing)
const URL_RE = /(https?:\/\/[^\s)\]]+)/g

export default function Linkify({ text }: { text: string }): ReactNode {
  const parts: ReactNode[] = []
  let last = 0

  for (const m of text.matchAll(URL_RE)) {
    const start = m.index ?? 0
    const url = m[0]
    if (start > last) parts.push(text.slice(last, start))
    parts.push(
      <a key={`${start}-${url}`} href={url} target="_blank" rel="noreferrer">
        {url}
      </a>
    )
    last = start + url.length
  }

  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}
