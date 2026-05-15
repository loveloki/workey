import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useAuthGuard } from '../lib/useAuthGuard'
import { useToast } from '../lib/toast-context'
import { useState, useEffect } from 'react'
import { type Attendance } from '../lib/api'
import { formatTime } from '../lib/date-utils'
import { LoadingScreen } from '../components/LoadingScreen'
import { useAttendanceToday, useClockIn, useClockOut, useLeave, useSetOvertime } from '../lib/queries'

export const Route = createFileRoute('/clock')({ component: ClockPage })

function ClockPage() {
  const { user, loading } = useAuthGuard()

  if (loading) return <LoadingScreen />
  if (!user) return null

  return (
    <main className="max-w-5xl mx-auto px-4 pb-8 pt-8">
      <div className="mb-8 text-center">
        <p className="mb-1 font-mono text-sm uppercase tracking-[0.3em] text-[var(--color-ink-secondary)]">打卡签到</p>
        <h1
          className="font-serif text-3xl font-normal tracking-tight text-[var(--color-ink)] sm:text-4xl"
        >
          {new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}
        </h1>
      </div>
      <ClockWidget />
    </main>
  )
}

function ClockWidget() {
  const { data: queryData, isLoading } = useAttendanceToday()
  const { toastError } = useToast()
  const [localData, setLocalData] = useState<Attendance | null | undefined>(null)
  const [now, setNow] = useState(new Date())
  const [isOvertime, setIsOvertime] = useState(false)
  const navigate = useNavigate()

  const clockInMut = useClockIn()
  const clockOutMut = useClockOut()
  const leaveMut = useLeave()
  const setOvertimeMut = useSetOvertime()

  const acting = clockInMut.isPending || clockOutMut.isPending || leaveMut.isPending || setOvertimeMut.isPending

  // query 数据到达时同步到本地
  useEffect(() => {
    if (queryData) setLocalData(queryData.attendance)
  }, [queryData])

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const data = localData

  const clockedIn = !!data?.clock_in
  const clockedOut = !!data?.clock_out
  const isLeave = data?.status === 'leave'

  const clockIn = async (overtime?: boolean) => {
    try {
      const res = await clockInMut.mutateAsync(overtime ?? isOvertime)
      setLocalData(res.attendance)
      setTimeout(() => navigate({ to: '/' }), 600)
    } catch (e: unknown) {
      toastError(e instanceof Error ? e.message : '操作失败')
    }
  }

  const toggleTodayOvertime = async () => {
    if (!data) return
    try {
      const res = await setOvertimeMut.mutateAsync({ date: data.date, isOvertime: !data.is_overtime })
      setLocalData(res.attendance)
    } catch (e: unknown) {
      toastError(e instanceof Error ? e.message : '操作失败')
    }
  }

  const clockOut = async () => {
    try {
      const res = await clockOutMut.mutateAsync()
      setLocalData(res.attendance)
    } catch (e: unknown) {
      toastError(e instanceof Error ? e.message : '操作失败')
    }
  }

  const markLeave = async () => {
    try {
      const res = await leaveMut.mutateAsync()
      setLocalData(res.attendance)
    } catch (e: unknown) {
      toastError(e instanceof Error ? e.message : '操作失败')
    }
  }

  if (isLoading) return <LoadingScreen />

  const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })

  return (
    <div className="flex flex-col items-center">
      <p className="font-mono text-5xl sm:text-6xl font-bold text-[var(--color-ink)] mb-8 tabular-nums tracking-wider">
        {timeStr}
      </p>

      {!clockedIn && !isLeave ? (
        <div className="flex flex-col items-center gap-6">
          <label className={`flex items-center gap-2 cursor-pointer select-none px-4 py-2 rounded-full border border-[var(--color-border)] ${isOvertime ? 'bg-[var(--color-surface-strong)]' : 'bg-transparent'}`}>
            <input
              type="checkbox"
              checked={isOvertime}
              onChange={e => setIsOvertime(e.target.checked)}
              className="w-4 h-4"
            />
            <span className={`font-mono text-sm ${isOvertime ? 'text-red-600' : 'text-[var(--color-ink-muted)]'}`}>
              今天是加班
            </span>
          </label>
          <button
            onClick={() => clockIn()}
            disabled={acting}
            className="group relative outline-none"
          >
            <div
              className="w-44 h-44 sm:w-52 sm:h-52 rounded-full flex flex-col items-center justify-center bg-[var(--color-solid)] shadow-[0_4px_24px_rgba(0,0,0,0.15),0_0_0_6px_rgba(0,0,0,0.04)] transition-all duration-200 active:scale-95 disabled:opacity-50"
            >
              <span className="font-mono text-2xl sm:text-3xl font-bold text-[var(--color-solid-text)]">
                {acting ? '打卡中' : '上班'}
              </span>
              <span className="font-mono text-sm mt-1 text-[var(--color-solid-text)] opacity-60">
                点击打卡
              </span>
            </div>
          </button>
          
          <button
            onClick={markLeave}
            disabled={acting}
            className="font-mono text-sm px-6 py-2 rounded-full border border-[var(--color-border)] bg-transparent text-[var(--color-ink-muted)] transition-colors active:scale-95 disabled:opacity-50"
          >
            我今天请假
          </button>
        </div>
      ) : isLeave ? (
        <div className="flex flex-col items-center gap-6">
          <div
            className="w-44 h-44 sm:w-52 sm:h-52 rounded-full flex flex-col items-center justify-center border-2 border-dashed border-[var(--color-border)] bg-[var(--color-surface-strong)]"
          >
            <span className="font-mono text-2xl sm:text-3xl font-bold text-[var(--color-ink-muted)]">
              已请假
            </span>
          </div>
          <button
            onClick={() => clockIn()}
            disabled={acting}
            className="font-mono text-sm px-6 py-2 rounded-full bg-[var(--color-solid)] text-[var(--color-solid-text)] transition-colors active:scale-95 disabled:opacity-50"
          >
            取消请假并上班
          </button>
        </div>
      ) : (
        <button
          onClick={clockOut}
          disabled={acting}
          className="group relative outline-none"
        >
          <div
            className={`w-44 h-44 sm:w-52 sm:h-52 rounded-full flex flex-col items-center justify-center shadow-[0_4px_24px_rgba(0,0,0,0.15),0_0_0_6px_rgba(0,0,0,0.04)] transition-all duration-200 active:scale-95 disabled:opacity-50 ${clockedOut ? 'bg-[var(--color-solid-hover)]' : 'bg-[var(--color-solid)]'}`}
          >
            <span className="font-mono text-2xl sm:text-3xl font-bold text-[var(--color-solid-text)]">
              {acting ? '打卡中' : '下班'}
            </span>
            <span className="font-mono text-sm mt-1 text-[var(--color-solid-text)] opacity-60">
              {clockedOut ? '更新时间' : '点击打卡'}
            </span>
          </div>
        </button>
      )}

      <div
        className="mt-10 flex items-center gap-4 sm:gap-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-strong)] px-4 sm:px-8 py-5"
      >
        <div className="text-center">
          <p className="font-mono text-xs uppercase tracking-wide text-[var(--color-ink-muted)] mb-1">上班</p>
          <p className="font-mono text-xl font-bold text-[var(--color-ink)]">{isLeave ? '--:--' : formatTime(data?.clock_in)}</p>
        </div>
        <div className="h-10 w-px bg-[var(--color-border)]" />
        <div className="text-center">
          <p className="font-mono text-xs uppercase tracking-wide text-[var(--color-ink-muted)] mb-1">下班</p>
          <p className="font-mono text-xl font-bold text-[var(--color-ink)]">{isLeave ? '--:--' : formatTime(data?.clock_out)}</p>
        </div>
        {!isLeave && clockedIn && data?.clock_in && data?.clock_out && (
          <>
            <div className="h-10 w-px bg-[var(--color-border)]" />
            <div className="text-center">
              <p className="font-mono text-xs uppercase tracking-wide text-[var(--color-ink-muted)] mb-1">时长</p>
              <p className="font-mono text-xl font-bold text-[var(--color-ink)]">{calcDuration(data.clock_in, data.clock_out)}</p>
            </div>
          </>
        )}
      </div>

      {clockedIn && !isLeave && (
        <button
          onClick={toggleTodayOvertime}
          disabled={acting}
          className={`mt-4 border border-[var(--color-border)] font-mono text-xs px-4 py-2 rounded-full transition-colors disabled:opacity-50 ${data?.is_overtime ? 'bg-red-100 text-red-600' : 'bg-transparent text-[var(--color-ink-muted)]'}`}
        >
          {data?.is_overtime ? '✓ 加班已标记（点击取消）' : '标记为加班'}
        </button>
      )}

      {clockedIn && !clockedOut && (
        <p className="mt-4 font-serif text-sm text-[var(--color-ink-faint)]">
          已上班打卡，下班时请再次打卡
        </p>
      )}
      {clockedIn && clockedOut && (
        <p className="mt-4 font-serif text-sm text-[var(--color-ink-faint)]">
          可再次点击更新下班时间
        </p>
      )}
    </div>
  )
}

function calcDuration(clockIn: string, clockOut: string): string {
  const a = new Date(clockIn)
  const b = new Date(clockOut)
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return '--'
  const diffMin = Math.round((b.getTime() - a.getTime()) / 60000)
  const h = Math.floor(diffMin / 60)
  const m = diffMin % 60
  return `${h}h${m.toString().padStart(2, '0')}m`
}
