import type { ReactNode } from 'react'

export default function SectionCard({
  title,
  right,
  children
}: {
  title: string
  right?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="card">
      <header className="cardHeader">
        <h2 className="cardTitle">{title}</h2>
        <div className="cardRight">{right}</div>
      </header>
      <div className="cardBody">{children}</div>
    </section>
  )
}
