type StaffState = 'working' | 'standby' | 'idle' | 'offline' | 'unknown'

function labelFor(state: StaffState) {
  switch (state) {
    case 'working':
      return 'Working'
    case 'standby':
      return 'Standby'
    case 'idle':
      return 'Idle'
    case 'offline':
      return 'Offline'
    default:
      return 'Unknown'
  }
}

export default function StatusPill({ state }: { state: StaffState }) {
  return (
    <span className={`pill pill-${state}`} title={state}>
      <span className="pillDot" />
      {labelFor(state)}
    </span>
  )
}

export type { StaffState }
