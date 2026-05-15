import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { AuthProvider, useAuth } from './auth-context'
import { setToken, clearToken } from './api'

// 测试 Feature：用户认证生命周期（登录、注册、退出、token 恢复）

function TestConsumer() {
  const { user, loading, logout } = useAuth()
  if (loading) return <div data-testid="loading">loading</div>
  if (!user) return <div data-testid="no-user">not logged in</div>
  return (
    <div>
      <span data-testid="username">{user.username}</span>
      <button data-testid="logout" onClick={logout}>logout</button>
    </div>
  )
}

describe('AuthProvider', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    localStorage.clear()
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('无 token 时直接显示未登录', async () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('no-user')).toBeInTheDocument()
    })
  })

  it('有 token 时调用 /api/auth/me 恢复用户', async () => {
    setToken('valid-token')
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      headers: new Headers(),
      text: () => Promise.resolve(JSON.stringify({ user: { id: 1, username: 'alice' } })),
    })

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('username')).toHaveTextContent('alice')
    })
  })

  it('token 过期（401）时清除 token 并显示未登录', async () => {
    setToken('expired-token')
    const err = new Error('Unauthorized')
    ;(err as any).status = 401
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 401,
      ok: false,
      headers: new Headers(),
      text: () => Promise.resolve(''),
    })

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('no-user')).toBeInTheDocument()
    })
    expect(localStorage.getItem('token')).toBeNull()
  })

  it('logout 清除用户状态', async () => {
    setToken('valid-token')
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      headers: new Headers(),
      text: () => Promise.resolve(JSON.stringify({ user: { id: 1, username: 'bob' } })),
    })

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('username')).toHaveTextContent('bob')
    })

    await act(async () => {
      screen.getByTestId('logout').click()
    })

    expect(screen.getByTestId('no-user')).toBeInTheDocument()
    expect(localStorage.getItem('token')).toBeNull()
  })
})

describe('useAuth outside provider', () => {
  it('在 Provider 外调用抛出错误', () => {
    function BadConsumer() {
      useAuth()
      return null
    }

    expect(() => render(<BadConsumer />)).toThrow(
      'useAuth must be used within AuthProvider',
    )
  })
})
