import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { auth as authApi, setToken, clearToken, isLoggedIn } from './api'

interface User {
  id: number
  username: string
}

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  register: (username: string, password: string) => Promise<void>
  loginWithToken: (token: string, user: User) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (isLoggedIn()) {
      authApi.me().then(data => {
        setUser(data.user)
      }).catch(() => {
        clearToken()
      }).finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const login = async (username: string, password: string) => {
    const data = await authApi.login(username, password)
    setToken(data.token)
    setUser(data.user)
  }

  const register = async (username: string, password: string) => {
    const data = await authApi.register(username, password)
    setToken(data.token)
    setUser(data.user)
  }

  const loginWithToken = (token: string, userData: User) => {
    setToken(token)
    setUser(userData)
  }

  const logout = () => {
    clearToken()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, loginWithToken, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
