import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useAuth } from '../lib/auth-context'
import { useState, useEffect } from 'react'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

function LoginPage() {
  const { user, loading, login, register } = useAuth()
  const navigate = useNavigate()
  const [isRegister, setIsRegister] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!loading && user) navigate({ to: '/' })
  }, [loading, user, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      if (isRegister) {
        await register(username, password)
      } else {
        await login(username, password)
      }
      navigate({ to: '/' })
    } catch (e: any) {
      setError(e.message)
    }
    setSubmitting(false)
  }

  if (loading) return null

  return (
    <main className="flex min-h-[80vh] items-center justify-center px-4">
      <div
        className="w-full max-w-md rounded-3xl border p-12 shadow-[0_16px_40px_rgba(0,0,0,0.06)]"
        style={{ borderColor: 'var(--color-border-subtle)', background: 'var(--color-surface)' }}
      >
        <div className="mb-8 text-center">
          <h1
            className="mb-2 text-3xl font-normal tracking-tight"
            style={{ fontFamily: 'Georgia, serif', color: 'var(--color-ink)' }}
          >
            {isRegister ? '注册账号' : '登录'}
          </h1>
          <p
            className="text-base"
            style={{ fontFamily: 'Georgia, serif', color: 'var(--color-ink-muted)' }}
          >
            {isRegister ? '创建一个新账号' : '登录以记录工作内容'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label
              htmlFor="username"
              className="mb-1.5 block font-mono text-sm font-semibold tracking-wide"
              style={{ color: 'var(--color-ink)' }}
            >
              用户名
            </label>
            <input
              id="username"
              name="username"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              autoComplete="username"
              className="w-full rounded-lg border px-4 py-3.5 text-base focus:outline-none"
              style={{
                borderColor: 'var(--color-border)',
                background: 'var(--color-surface)',
                color: 'var(--color-ink)',
              }}
              onFocus={e => (e.target.style.borderColor = 'var(--color-border-focus)')}
              onBlur={e => (e.target.style.borderColor = 'var(--color-border)')}
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block font-mono text-sm font-semibold tracking-wide"
              style={{ color: 'var(--color-ink)' }}
            >
              密码
            </label>
            <input
              id="password"
              name="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              className="w-full rounded-lg border px-4 py-3.5 text-base focus:outline-none"
              style={{
                borderColor: 'var(--color-border)',
                background: 'var(--color-surface)',
                color: 'var(--color-ink)',
              }}
              onFocus={e => (e.target.style.borderColor = 'var(--color-border-focus)')}
              onBlur={e => (e.target.style.borderColor = 'var(--color-border)')}
            />
          </div>

          {error && (
            <p className="text-sm" style={{ color: 'var(--color-danger-text)' }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-full py-3.5 font-mono text-base font-semibold hover:bg-[var(--color-solid-hover)] disabled:opacity-50"
            style={{ background: 'var(--color-solid)', color: 'var(--color-solid-text)' }}
          >
            {submitting ? '请稍候...' : isRegister ? '注册' : '登录'}
          </button>
        </form>

        <p
          className="mt-6 text-center text-sm"
          style={{ fontFamily: 'Georgia, serif', color: 'var(--color-ink-muted)' }}
        >
          {isRegister ? '已有账号？' : '没有账号？'}
          <button
            onClick={() => { setIsRegister(!isRegister); setError('') }}
            className="ml-1 font-semibold underline"
            style={{ fontFamily: 'Georgia, serif', color: 'var(--color-ink)' }}
          >
            {isRegister ? '去登录' : '注册'}
          </button>
        </p>
      </div>
    </main>
  )
}
