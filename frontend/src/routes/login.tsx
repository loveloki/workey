import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useAuth } from '../lib/auth-context'
import { useState, useEffect } from 'react'
import { useI18n } from '../lib/i18n'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

function LoginPage() {
  const { t } = useI18n()
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
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('common.operationFailed'))
    }
    setSubmitting(false)
  }

  if (loading) return null

  return (
    <main className="flex min-h-[80vh] items-center justify-center px-4">
      <div
        className="w-full max-w-md rounded-3xl border p-12 shadow-[0_16px_40px_rgba(0,0,0,0.06)] border-[var(--color-border-subtle)] bg-[var(--color-surface)]"
      >
        <div className="mb-8 text-center">
          <h1
            className="mb-2 text-3xl font-normal tracking-tight font-serif text-[var(--color-ink)]"
          >
            {isRegister ? t('login.registerTitle') : t('login.loginTitle')}
          </h1>
          <p
            className="text-base font-serif text-[var(--color-ink-muted)]"
          >
            {isRegister ? t('login.registerSubtitle') : t('login.loginSubtitle')}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label
              htmlFor="username"
              className="mb-1.5 block font-mono text-sm font-semibold tracking-wide text-[var(--color-ink)]"
            >
              {t('login.username')}
            </label>
            <input
              id="username"
              name="username"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              autoComplete="username"
              className="w-full rounded-lg border px-4 py-3.5 text-base focus:outline-none border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink)] focus:border-[var(--color-border-focus)]"
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block font-mono text-sm font-semibold tracking-wide text-[var(--color-ink)]"
            >
              {t('login.password')}
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
              className="w-full rounded-lg border px-4 py-3.5 text-base focus:outline-none border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink)] focus:border-[var(--color-border-focus)]"
            />
          </div>

          {error && (
            <p className="text-sm text-[var(--color-danger-text)]">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-full py-3.5 font-mono text-base font-semibold hover:bg-[var(--color-solid-hover)] disabled:opacity-50 bg-[var(--color-solid)] text-[var(--color-solid-text)]"
          >
            {submitting ? t('login.pleaseWait') : isRegister ? t('login.register') : t('login.login')}
          </button>
        </form>

        <p
          className="mt-6 text-center text-sm font-serif text-[var(--color-ink-muted)]"
        >
          {isRegister ? t('login.haveAccount') : t('login.noAccount')}
          <button
            onClick={() => { setIsRegister(!isRegister); setError('') }}
            className="ml-1 font-semibold underline font-serif text-[var(--color-ink)]"
          >
            {isRegister ? t('login.goLogin') : t('login.register')}
          </button>
        </p>
      </div>
    </main>
  )
}
