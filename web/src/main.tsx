import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './tokens.css'
import './styles.css'

// Optional: allow `?theme=light|dark` for quick QA + screenshots.
try {
  const p = new URLSearchParams(window.location.search)
  const t = p.get('theme')
  if (t === 'light' || t === 'dark') {
    window.localStorage.setItem('openclaw_monitor_theme', t)
    document.documentElement.dataset.theme = t
  }
} catch {
  // ignore
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
