import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import AgentDetailPage from './pages/AgentDetailPage'
import DashboardPage from './pages/DashboardPage'

const router = createBrowserRouter([
  { path: '/', element: <DashboardPage /> },
  { path: '/agents/:id', element: <AgentDetailPage /> }
])

export default function App() {
  return <RouterProvider router={router} />
}
