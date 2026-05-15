import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useAuthGuard } from '../lib/useAuthGuard'
import { useEffect, useCallback } from 'react'
import { attendance, workLogs, todos as todosApi } from '../lib/api'
import { formatTime, getToday } from '../lib/date-utils'
import { formatDayMarkdown } from '../lib/report-utils'
import { CopyButton } from '../components/CopyButton'
import { LoadingScreen } from '../components/LoadingScreen'
import { WorkLogSection } from '../components/dashboard/WorkLogSection'
import { CompletedTodosSection } from '../components/dashboard/CompletedTodosSection'
import { TodayCreatedTodosSidebar, TodayCreatedTodosInline } from '../components/dashboard/TodayCreatedTodos'
import { useAttendanceToday } from '../lib/queries'

export const Route = createFileRoute('/')({ component: Dashboard })


function Dashboard() {
  const { user, loading: authLoading } = useAuthGuard()
  const navigate = useNavigate()
  const { data: todayQuery, isLoading: checking } = useAttendanceToday(!!user)

  const todayData = todayQuery?.attendance ?? null

  // 未打卡时自动跳转到打卡页
  useEffect(() => {
    if (!todayQuery) return
    const att = todayQuery.attendance
    if (!att?.clock_in && att?.status !== 'leave') {
      navigate({ to: '/clock' })
    }
  }, [todayQuery, navigate])

  const copyTodayReport = useCallback(async () => {
    const today = getToday()
    const [attRes, logRes, todosRes] = await Promise.all([
      attendance.today(),
      workLogs.today(),
      todosApi.completedToday(),
    ])
    return formatDayMarkdown(
      today,
      attRes.attendance ?? null,
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
            className="text-3xl font-normal tracking-tight text-[var(--color-ink)] sm:text-4xl font-serif"
          >
            {new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}
          </h1>
        </div>
        <CopyButton getText={copyTodayReport} className="mt-2" />
      </div>

      {/* Desktop: two-column layout */}
      <div className="hidden md:flex gap-6 items-start">
        <div
          className="flex-1 min-w-0 rounded-lg overflow-hidden bg-[var(--color-surface-strong)] border border-[var(--color-border)]"
        >
          {todayData && (
            <div className="flex items-center gap-6 px-6 py-4">
              <div className="flex items-center gap-2">
                {todayData?.is_overtime && <span className="bg-red-100 text-red-600 px-1.5 py-0.5 rounded text-[10px] font-bold">加班</span>}
                {todayData.status === 'leave' ? (
                  <span className="font-mono text-sm font-bold text-[var(--color-danger-text,#dc2626)]">已请假</span>
                ) : (
                  <>
                    <span className="font-mono text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">上班</span>
                    <span className="font-mono text-sm font-bold text-[var(--color-ink)]">{formatTime(todayData.clock_in)}</span>
                  </>
                )}
              </div>
              {todayData.status !== 'leave' && (
                <>
                  <div className="h-4 w-px bg-[var(--color-border)]" />
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">下班</span>
                    <span className="font-mono text-sm font-bold text-[var(--color-ink)]">{formatTime(todayData.clock_out)}</span>
                  </div>
                </>
              )}
              <div className="flex-1" />
              <button
                onClick={() => navigate({ to: '/clock' })}
                className="font-mono text-xs px-3 py-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-hover)] border border-[var(--color-border)] text-[var(--color-ink-muted)]"
              >
                打卡 →
              </button>
            </div>
          )}
          <div className="border-t border-dashed border-t-[var(--color-border)]" />
          <WorkLogSection />
          <div className="border-t border-dashed border-t-[var(--color-border)]" />
          <CompletedTodosSection />
        </div>

        <div className="w-80 shrink-0 lg:w-96">
          <TodayCreatedTodosSidebar />
        </div>
      </div>

      {/* Mobile: single-column layout */}
      <div className="md:hidden">
        <div
          className="rounded-lg overflow-hidden bg-[var(--color-surface-strong)] border border-[var(--color-border)]"
        >
          {todayData && (
            <div className="flex items-center gap-6 px-6 py-4">
              <div className="flex items-center gap-2">
                {todayData?.is_overtime && <span className="bg-red-100 text-red-600 px-1.5 py-0.5 rounded text-[10px] font-bold">加班</span>}
                {todayData.status === 'leave' ? (
                  <span className="font-mono text-sm font-bold text-[var(--color-danger-text,#dc2626)]">已请假</span>
                ) : (
                  <>
                    <span className="font-mono text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">上班</span>
                    <span className="font-mono text-sm font-bold text-[var(--color-ink)]">{formatTime(todayData.clock_in)}</span>
                  </>
                )}
              </div>
              {todayData.status !== 'leave' && (
                <>
                  <div className="h-4 w-px bg-[var(--color-border)]" />
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">下班</span>
                    <span className="font-mono text-sm font-bold text-[var(--color-ink)]">{formatTime(todayData.clock_out)}</span>
                  </div>
                </>
              )}
              <div className="flex-1" />
              <button
                onClick={() => navigate({ to: '/clock' })}
                className="font-mono text-xs px-3 py-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-hover)] border border-[var(--color-border)] text-[var(--color-ink-muted)]"
              >
                打卡 →
              </button>
            </div>
          )}

          <div className="border-t border-dashed border-t-[var(--color-border)]" />
          <TodayCreatedTodosInline />

          <div className="border-t border-dashed border-t-[var(--color-border)]" />
          <WorkLogSection />
          <div className="border-t border-dashed border-t-[var(--color-border)]" />
          <CompletedTodosSection />
        </div>
      </div>
    </main>
  )
}
