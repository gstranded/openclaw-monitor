import type { ReactNode } from 'react'

export default function CompactRow({
  left,
  right,
  href
}: {
  left: ReactNode
  right?: ReactNode
  href?: string
}) {
  const content = (
    <>
      <div className="rowLeft">{left}</div>
      {right ? <div className="rowRight">{right}</div> : null}
    </>
  )

  if (href) {
    return (
      <a className="compactRow" href={href}>
        {content}
      </a>
    )
  }

  return <div className="compactRow">{content}</div>
}
