import { useEffect, useState } from 'react'

type Theme = 'dark' | 'light'

const KEY = 'openclaw_monitor_theme'

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
}

function readTheme(): Theme {
  const saved = window.localStorage.getItem(KEY)
  if (saved === 'light' || saved === 'dark') return saved
  return 'dark'
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark')

  useEffect(() => {
    const t = readTheme()
    setTheme(t)
    applyTheme(t)
  }, [])

  const next: Theme = theme === 'dark' ? 'light' : 'dark'

  return (
    <button
      className="btn ghost"
      onClick={() => {
        setTheme(next)
        window.localStorage.setItem(KEY, next)
        applyTheme(next)
      }}
      title={`Switch to ${next} theme`}
      type="button"
    >
      {theme === 'dark' ? '☀ Light' : '🌙 Dark'}
    </button>
  )
}
