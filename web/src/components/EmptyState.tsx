import type { ReactNode } from 'react'

export default function EmptyState({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) {
  return (
    <div className="emptyState">
      <div className="emptyTitle">{title}</div>
      {detail ? <div className="emptyDetail">{detail}</div> : null}
      {action ? <div className="emptyAction">{action}</div> : null}
    </div>
  )
}
