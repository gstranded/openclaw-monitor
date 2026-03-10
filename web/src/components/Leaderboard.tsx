import type { LeaderboardEntry } from '../lib/dashboardTypes'

export default function Leaderboard({ rows }: { rows: LeaderboardEntry[] }) {
  if (!rows.length) return <div className="empty">No leaderboard data.</div>

  return (
    <ol className="leaderboard">
      {rows.map((r, idx) => (
        <li key={`${r.agentId || r.name}-${idx}`} className="leaderRow">
          <span className="rank">#{idx + 1}</span>
          <span className="name">{r.name}</span>
          <span className="points">{r.points}</span>
          <span className={`delta ${r.delta24h && r.delta24h < 0 ? 'neg' : 'pos'}`}>
            {typeof r.delta24h === 'number' ? (r.delta24h >= 0 ? `+${r.delta24h}` : `${r.delta24h}`) : '—'}
          </span>
        </li>
      ))}
    </ol>
  )
}
