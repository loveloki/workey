import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { PageHeader } from '../components/PageHeader'
import { useAuthGuard } from '../lib/useAuthGuard'
import { useEffect, useCallback } from 'react'
import { attendance, workLogs, todos as todosApi } from '../lib/api'
import { getToday } from '../lib/date-utils'
import { formatDayMarkdown } from '../lib/report-utils'
import { CopyButton } from '../components/CopyButton'
import { LoadingScreen } from '../components/LoadingScreen'
import { WorkLogSection } from '../components/dashboard/WorkLogSection'
import { CompletedTodosSection } from '../components/dashboard/CompletedTodosSection'
import { TodayCreatedTodosSidebar, TodayCreatedTodosInline } from '../components/dashboard/TodayCreatedTodos'
import { AttendanceStatusBar } from '../components/dashboard/AttendanceStatusBar'
import { ChecklistReminderSection } from '../components/dashboard/ChecklistReminderSection'
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

  const copyBtn = <CopyButton getText={copyTodayReport} />

  return (
    <main className="max-w-7xl mx-auto px-4 pb-8 pt-8">
      <PageHeader
        eyebrow="今日工作"
        title={new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}
      />

      <ChecklistReminderSection
        date={getToday()}
        enabled={!!todayData?.clock_in && todayData.status !== 'leave'}
      />

      {/* Desktop: two-column layout */}
      <div className="hidden md:flex gap-6 items-start">
        <div
          className="flex-1 min-w-0 rounded-lg overflow-hidden bg-[var(--color-surface-strong)] border border-[var(--color-border)]"
        >
          {todayData && <AttendanceStatusBar data={todayData} />}
          <div className="border-t border-dashed border-t-[var(--color-border)]" />
          <WorkLogSection toolbarExtra={copyBtn} />
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
          {todayData && <AttendanceStatusBar data={todayData} />}

          <div className="border-t border-dashed border-t-[var(--color-border)]" />
          <TodayCreatedTodosInline />

          <div className="border-t border-dashed border-t-[var(--color-border)]" />
          <WorkLogSection toolbarExtra={copyBtn} />
          <div className="border-t border-dashed border-t-[var(--color-border)]" />
          <CompletedTodosSection />
        </div>
      </div>
    </main>
  )
}
