import type { DashboardHealth } from '../lib/dashboardTypes'

export default function StatusBadge({ health }: { health: DashboardHealth }) {
  const cls =
    health === 'ok'
      ? 'badge ok'
      : health === 'partial'
        ? 'badge partial'
        : health === 'degraded'
          ? 'badge degraded'
          : health === 'error'
            ? 'badge error'
            : 'badge unknown'

  const label = health.toUpperCase()

  return <span className={cls}>{label}</span>
}
