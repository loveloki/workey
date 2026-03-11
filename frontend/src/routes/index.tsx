import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useAuth } from '../lib/auth-context'
import { useState, useEffect, useCallback } from 'react'
import { attendance, workLogs } from '../lib/api'
import { formatTime, getToday } from '../lib/date-utils'

export const Route = createFileRoute('/')({
  component: Dashboard,
})

function Dashboard() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!loading && !user) navigate({ to: '/login' })
  }, [loading, user, navigate])

  if (loading) return <LoadingScreen />
  if (!user) return null

  return (
    <main className="page-wrap px-4 pb-8 pt-8">
      <div className="rise-in mb-6">
        <p className="island-kicker mb-1">今日工作</p>
        <h1 className="display-title text-3xl font-bold tracking-tight text-[var(--sea-ink)] sm:text-4xl">
          {new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}
        </h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <ClockCard />
        <WorkLogCard />
      </div>
    </main>
  )
}

function ClockCard() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)

  const load = useCallback(() => {
    attendance.today().then(d => setData(d.attendance)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const clockIn = async () => {
    setActing(true)
    try {
      const res = await attendance.clockIn()
      setData(res)
    } catch (e: any) {
      alert(e.message)
    }
    setActing(false)
  }

  const clockOut = async () => {
    setActing(true)
    try {
      const res = await attendance.clockOut()
      setData(res)
    } catch (e: any) {
      alert(e.message)
    }
    setActing(false)
  }

  const clockedIn = !!data?.clock_in
  const clockedOut = !!data?.clock_out

  return (
    <div className="island-shell rise-in rounded-2xl p-6" style={{ animationDelay: '80ms' }}>
      <p className="island-kicker mb-3">打卡签到</p>

      {loading ? (
        <p className="text-sm text-[var(--sea-ink-soft)]">加载中...</p>
      ) : (
        <>
          <div className="mb-4 flex items-center gap-6">
            <div>
              <p className="text-xs text-[var(--sea-ink-soft)]">上班</p>
              <p className="text-2xl font-bold text-[var(--sea-ink)]">{formatTime(data?.clock_in)}</p>
            </div>
            <div className="h-8 w-px bg-[var(--line)]" />
            <div>
              <p className="text-xs text-[var(--sea-ink-soft)]">下班</p>
              <p className="text-2xl font-bold text-[var(--sea-ink)]">{formatTime(data?.clock_out)}</p>
            </div>
          </div>

          <div className="flex gap-2">
            {!clockedIn && (
              <button
                onClick={clockIn}
                disabled={acting}
                className="rounded-full border border-[rgba(50,143,151,0.3)] bg-[rgba(79,184,178,0.14)] px-5 py-2 text-sm font-semibold text-[var(--lagoon-deep)] transition hover:-translate-y-0.5 hover:bg-[rgba(79,184,178,0.24)] disabled:opacity-50"
              >
                上班打卡
              </button>
            )}
            {clockedIn && (
              <button
                onClick={clockOut}
                disabled={acting}
                className="rounded-full border border-[rgba(50,143,151,0.3)] bg-[rgba(79,184,178,0.14)] px-5 py-2 text-sm font-semibold text-[var(--lagoon-deep)] transition hover:-translate-y-0.5 hover:bg-[rgba(79,184,178,0.24)] disabled:opacity-50"
              >
                {clockedOut ? '更新下班时间' : '下班打卡'}
              </button>
            )}
          </div>

          {clockedIn && clockedOut && (
            <p className="mt-2 text-xs text-[var(--sea-ink-soft)]">
              可多次点击更新下班时间
            </p>
          )}
        </>
      )}
    </div>
  )
}

function WorkLogCard() {
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    workLogs.today().then(d => {
      if (d.work_log) setContent(d.work_log.content)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      await workLogs.save(getToday(), content)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e: any) {
      alert(e.message)
    }
    setSaving(false)
  }

  return (
    <div className="island-shell rise-in rounded-2xl p-6" style={{ animationDelay: '160ms' }}>
      <p className="island-kicker mb-3">工作内容</p>

      {loading ? (
        <p className="text-sm text-[var(--sea-ink-soft)]">加载中...</p>
      ) : (
        <>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="记录今天的工作内容..."
            className="mb-3 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 text-sm text-[var(--sea-ink)] placeholder:text-[var(--sea-ink-soft)] focus:border-[var(--lagoon)] focus:outline-none"
            rows={6}
          />
          <div className="flex items-center gap-3">
            <button
              onClick={save}
              disabled={saving}
              className="rounded-full border border-[rgba(50,143,151,0.3)] bg-[rgba(79,184,178,0.14)] px-5 py-2 text-sm font-semibold text-[var(--lagoon-deep)] transition hover:-translate-y-0.5 hover:bg-[rgba(79,184,178,0.24)] disabled:opacity-50"
            >
              {saving ? '保存中...' : '保存'}
            </button>
            {saved && <span className="text-xs text-[var(--palm)]">✓ 已保存</span>}
          </div>
        </>
      )}
    </div>
  )
}

function LoadingScreen() {
  return (
    <main className="page-wrap flex min-h-[60vh] items-center justify-center px-4">
      <p className="text-sm text-[var(--sea-ink-soft)]">加载中...</p>
    </main>
  )
}
