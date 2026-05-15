import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { isLoggedIn } from './api'
import { useSettings } from './queries'

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
    root.removeAttribute('data-theme')
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem('workey-theme') as Theme | null
    return stored && ['light', 'dark', 'auto'].includes(stored) ? stored : 'light'
  })

  // 仅在已登录时拉取服务端主题设置（query 自动去重，多个组件共享同一份缓存）
  const { data } = useSettings(isLoggedIn())

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  // 服务端主题同步
  useEffect(() => {
    if (data?.theme && ['light', 'dark', 'auto'].includes(data.theme)) {
      setThemeState(data.theme as Theme)
      localStorage.setItem('workey-theme', data.theme)
    }
  }, [data])

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
