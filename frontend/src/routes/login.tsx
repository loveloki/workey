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
      <div className="w-full max-w-md rounded-3xl border border-black/[0.06] bg-[rgba(255,255,248,0.95)] p-12 shadow-[0_16px_40px_rgba(0,0,0,0.06)]">
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-3xl font-normal tracking-tight text-black" style={{ fontFamily: 'Georgia, serif' }}>
            {isRegister ? '注册账号' : '登录'}
          </h1>
          <p className="text-base text-[#5a5a5a]" style={{ fontFamily: 'Georgia, serif' }}>
            {isRegister ? '创建一个新账号' : '登录以记录工作内容'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="mb-1.5 block font-mono text-sm font-semibold tracking-wide text-black">用户名</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              autoComplete="username"
              className="w-full rounded-lg border border-black/10 bg-[#fffdf5] px-4 py-3.5 text-base text-black focus:border-black focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1.5 block font-mono text-sm font-semibold tracking-wide text-black">密码</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              className="w-full rounded-lg border border-black/10 bg-[#fffdf5] px-4 py-3.5 text-base text-black focus:border-black focus:outline-none"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-full bg-black py-3.5 font-mono text-base font-semibold text-white hover:bg-[#222] disabled:opacity-50"
          >
            {submitting ? '请稍候...' : isRegister ? '注册' : '登录'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[#666]" style={{ fontFamily: 'Georgia, serif' }}>
          {isRegister ? '已有账号？' : '没有账号？'}
          <button
            onClick={() => { setIsRegister(!isRegister); setError('') }}
            className="ml-1 font-semibold text-black underline"
            style={{ fontFamily: 'Georgia, serif' }}
          >
            {isRegister ? '去登录' : '注册'}
          </button>
        </p>
      </div>
    </main>
  )
}
