import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useAuth } from '../lib/auth-context'
import { useState, useEffect, useCallback } from 'react'
import { attendance, workLogs, todos as todosApi, type Attendance } from '../lib/api'
import { formatTime, getToday } from '../lib/date-utils'
import { formatDayMarkdown } from '../lib/report-utils'
import { CopyButton } from '../components/CopyButton'
import { LoadingScreen } from '../components/LoadingScreen'
import { WorkLogSection } from '../components/dashboard/WorkLogSection'
import { CompletedTodosSection } from '../components/dashboard/CompletedTodosSection'
import { TodayCreatedTodosSidebar, TodayCreatedTodosInline } from '../components/dashboard/TodayCreatedTodos'

export const Route = createFileRoute('/')({ component: Dashboard })


function Dashboard() {
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [todayData, setTodayData] = useState<Attendance | null>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: '/login' })
  }, [authLoading, user, navigate])

  // Check if clocked in today
  useEffect(() => {
    if (!user) return
    attendance.today()
      .then(d => {
        if (!d.attendance?.clock_in && d.attendance?.status !== 'leave') {
          navigate({ to: '/clock' })
        } else {
          setTodayData(d.attendance)
          setChecking(false)
        }
      })
      .catch(() => setChecking(false))
  }, [user, navigate])

  const copyTodayReport = useCallback(async () => {
    const today = getToday()
    const [attRes, logRes, todosRes] = await Promise.all([
      attendance.today(),
      workLogs.today(),
      todosApi.completedToday(),
    ])
    return formatDayMarkdown(
      today,
      attRes.attendance,
      logRes.work_log?.content || '',
      todosRes.todos || [],
    )
  }, [])

  if (authLoading || checking) return <LoadingScreen />
  if (!user) return null

  return (
    <main className="max-w-7xl mx-auto px-4 pb-8 pt-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <p className="mb-1 font-mono text-sm uppercase tracking-[0.3em] text-[var(--color-ink-secondary)]">今日工作</p>
          <h1
            className="text-3xl font-normal tracking-tight text-[var(--color-ink)] sm:text-4xl"
            style={{ fontFamily: 'Georgia, serif' }}
          >
            {new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}
          </h1>
        </div>
        <CopyButton getText={copyTodayReport} className="mt-2" />
      </div>

      {/* Desktop: two-column layout */}
      <div className="hidden md:flex gap-6 items-start">
        {/* Left: Daily report card */}
        <div
          className="flex-1 min-w-0 rounded-lg overflow-hidden"
          style={{ background: 'var(--color-surface-strong)', border: '1px solid var(--color-border)' }}
        >
          {todayData && (
            <div className="flex items-center gap-6 px-6 py-4">
              <div className="flex items-center gap-2">
                {todayData?.is_overtime && <span className="bg-red-100 text-red-600 px-1.5 py-0.5 rounded text-[10px] font-bold">加班</span>}
                {todayData.status === 'leave' ? (
                  <span className="font-mono text-sm font-bold" style={{ color: 'var(--color-danger-text, #dc2626)' }}>已请假</span>
                ) : (
                  <>
                    <span className="font-mono text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">上班</span>
                    <span className="font-mono text-sm font-bold text-[var(--color-ink)]">{formatTime(todayData.clock_in)}</span>
                  </>
                )}
              </div>
              {todayData.status !== 'leave' && (
                <>
                  <div className="h-4 w-px" style={{ background: 'var(--color-border)' }} />
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">下班</span>
                    <span className="font-mono text-sm font-bold text-[var(--color-ink)]">{formatTime(todayData.clock_out)}</span>
                  </div>
                </>
              )}
              <div className="flex-1" />
              <button
                onClick={() => navigate({ to: '/clock' })}
                className="font-mono text-xs px-3 py-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-hover)]"
                style={{ border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-ink-muted)' }}
              >
                打卡 →
              </button>
            </div>
          )}
          <div style={{ borderTop: '1px dashed var(--color-border)' }} />
          <WorkLogSection />
          <div style={{ borderTop: '1px dashed var(--color-border)' }} />
          <CompletedTodosSection />
        </div>

        {/* Right: Today's created todos sidebar */}
        <div className="w-80 shrink-0 lg:w-96">
          <TodayCreatedTodosSidebar />
        </div>
      </div>

      {/* Mobile: single-column layout */}
      <div className="md:hidden">
        <div
          className="rounded-lg overflow-hidden"
          style={{ background: 'var(--color-surface-strong)', border: '1px solid var(--color-border)' }}
        >
          {todayData && (
            <div className="flex items-center gap-6 px-6 py-4">
              <div className="flex items-center gap-2">
                {todayData?.is_overtime && <span className="bg-red-100 text-red-600 px-1.5 py-0.5 rounded text-[10px] font-bold">加班</span>}
                {todayData.status === 'leave' ? (
                  <span className="font-mono text-sm font-bold" style={{ color: 'var(--color-danger-text, #dc2626)' }}>已请假</span>
                ) : (
                  <>
                    <span className="font-mono text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">上班</span>
                    <span className="font-mono text-sm font-bold text-[var(--color-ink)]">{formatTime(todayData.clock_in)}</span>
                  </>
                )}
              </div>
              {todayData.status !== 'leave' && (
                <>
                  <div className="h-4 w-px" style={{ background: 'var(--color-border)' }} />
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">下班</span>
                    <span className="font-mono text-sm font-bold text-[var(--color-ink)]">{formatTime(todayData.clock_out)}</span>
                  </div>
                </>
              )}
              <div className="flex-1" />
              <button
                onClick={() => navigate({ to: '/clock' })}
                className="font-mono text-xs px-3 py-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-hover)]"
                style={{ border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-ink-muted)' }}
              >
                打卡 →
              </button>
            </div>
          )}

          {/* Today's created todos — above work content on mobile */}
          <div style={{ borderTop: '1px dashed var(--color-border)' }} />
          <TodayCreatedTodosInline />

          <div style={{ borderTop: '1px dashed var(--color-border)' }} />
          <WorkLogSection />
          <div style={{ borderTop: '1px dashed var(--color-border)' }} />
          <CompletedTodosSection />
        </div>
      </div>
    </main>
  )
}
