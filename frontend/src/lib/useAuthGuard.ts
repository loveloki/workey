import { useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAuth } from './auth-context'

/**
 * 统一认证守卫 hook。
 * 未登录时自动跳转到 /login，返回 { user, loading } 供页面决定渲染逻辑。
 */
export function useAuthGuard() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!loading && !user) navigate({ to: '/login' })
  }, [loading, user, navigate])

  return { user, loading }
}
