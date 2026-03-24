import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { settings } from './api'
import { isLoggedIn } from './api'

export type Theme = 'light' | 'dark' | 'auto'

interface ThemeContextValue {
  theme: Theme
  setTheme: (t: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  setTheme: () => {},
})

export function useTheme() {
  return useContext(ThemeContext)
}

function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'dark') {
    root.setAttribute('data-theme', 'dark')
  } else if (theme === 'light') {
    root.setAttribute('data-theme', 'light')
  } else {
    // auto: remove attribute, let CSS @media handle it
    root.removeAttribute('data-theme')
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    // Read from localStorage for instant apply before API loads
    const stored = localStorage.getItem('workey-theme') as Theme | null
    return stored && ['light', 'dark', 'auto'].includes(stored) ? stored : 'light'
  })

  // Apply theme to DOM whenever it changes
  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  // Fetch from server on mount (if logged in)
  useEffect(() => {
    if (isLoggedIn()) {
      settings.get().then(data => {
        if (data.theme && ['light', 'dark', 'auto'].includes(data.theme)) {
          setThemeState(data.theme as Theme)
          localStorage.setItem('workey-theme', data.theme)
        }
      }).catch(() => {})
    }
  }, [])

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    localStorage.setItem('workey-theme', t)
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
