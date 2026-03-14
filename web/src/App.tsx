import DashboardPage from './pages/DashboardPage'
import AgentPage from './pages/AgentPage'
import MarkdownEditorPage from './pages/MarkdownEditorPage'
import MarkdownListPage from './pages/MarkdownListPage'
import StaffPage from './pages/StaffPage'

function decodePathPart(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export default function App() {
  const pathname = window.location.pathname || '/'
  const parts = pathname.split('/').filter(Boolean)

  if (parts.length === 0) return <DashboardPage />

  if (parts[0] === 'agents' && parts[1]) {
    return <AgentPage agentId={decodePathPart(parts[1])} />
  }

  if (parts[0] === 'staff') {
    return <StaffPage />
  }

  if (parts[0] === 'markdown' && parts.length === 1) {
    return <MarkdownListPage />
  }

  if (parts[0] === 'markdown' && parts[1]) {
    return <MarkdownEditorPage fileId={decodePathPart(parts[1])} />
  }

  return (
    <div className="page">
      <div className="banner error">
        <div className="bannerTitle">Not found</div>
        <div className="bannerBody">Unknown route: {pathname}</div>
        <div className="bannerHint">
          <a href="/">Go back to dashboard</a>
        </div>
      </div>
    </div>
  )
}
