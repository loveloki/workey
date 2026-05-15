import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useAuthGuard } from '../lib/useAuthGuard'
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
          className="text-3xl font-normal tracking-tight text-[var(--color-ink)] sm:text-4xl"
          style={{ fontFamily: 'Georgia, serif' }}
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
  // 本地 data 用于即时更新 UI（mutation 返回后立即反映）
  const [localData, setLocalData] = useState<Attendance | null>(null)
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
      alert(e instanceof Error ? e.message : '操作失败')
    }
  }

  const toggleTodayOvertime = async () => {
    if (!data) return
    try {
      const res = await setOvertimeMut.mutateAsync({ date: data.date, isOvertime: !data.is_overtime })
      setLocalData(res.attendance)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : '操作失败')
    }
  }

  const clockOut = async () => {
    try {
      const res = await clockOutMut.mutateAsync()
      setLocalData(res.attendance)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : '操作失败')
    }
  }

  const markLeave = async () => {
    try {
      const res = await leaveMut.mutateAsync()
      setLocalData(res.attendance)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : '操作失败')
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
          <label className="flex items-center gap-2 cursor-pointer select-none px-4 py-2 rounded-full" style={{ border: '1px solid var(--color-border)', background: isOvertime ? 'var(--color-surface-strong)' : 'transparent' }}>
            <input
              type="checkbox"
              checked={isOvertime}
              onChange={e => setIsOvertime(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="font-mono text-sm" style={{ color: isOvertime ? '#dc2626' : 'var(--color-ink-muted)' }}>
              今天是加班
            </span>
          </label>
          <button
            onClick={() => clockIn()}
            disabled={acting}
            className="group relative"
            style={{ outline: 'none' }}
          >
            <div
              className="w-44 h-44 sm:w-52 sm:h-52 rounded-full flex flex-col items-center justify-center transition-all duration-200 active:scale-95 disabled:opacity-50"
              style={{
                background: 'var(--color-solid)',
                boxShadow: '0 4px 24px rgba(0,0,0,0.15), 0 0 0 6px rgba(0,0,0,0.04)',
              }}
            >
              <span className="font-mono text-2xl sm:text-3xl font-bold" style={{ color: 'var(--color-solid-text)' }}>
                {acting ? '打卡中' : '上班'}
              </span>
              <span className="font-mono text-sm mt-1" style={{ color: 'var(--color-solid-text)', opacity: 0.6 }}>
                点击打卡
              </span>
            </div>
          </button>
          
          <button
            onClick={markLeave}
            disabled={acting}
            className="font-mono text-sm px-6 py-2 rounded-full transition-colors active:scale-95 disabled:opacity-50"
            style={{ 
              background: 'transparent',
              color: 'var(--color-ink-muted)',
              border: '1px solid var(--color-border)'
            }}
          >
            我今天请假
          </button>
        </div>
      ) : isLeave ? (
        <div className="flex flex-col items-center gap-6">
          <div
            className="w-44 h-44 sm:w-52 sm:h-52 rounded-full flex flex-col items-center justify-center"
            style={{
              background: 'var(--color-surface-strong)',
              border: '2px dashed var(--color-border)',
            }}
          >
            <span className="font-mono text-2xl sm:text-3xl font-bold" style={{ color: 'var(--color-ink-muted)' }}>
              已请假
            </span>
          </div>
          <button
            onClick={() => clockIn()}
            disabled={acting}
            className="font-mono text-sm px-6 py-2 rounded-full transition-colors active:scale-95 disabled:opacity-50"
            style={{ 
              background: 'var(--color-solid)',
              color: 'var(--color-solid-text)',
            }}
          >
            取消请假并上班
          </button>
        </div>
      ) : (
        <button
          onClick={clockOut}
          disabled={acting}
          className="group relative"
          style={{ outline: 'none' }}
        >
          <div
            className="w-44 h-44 sm:w-52 sm:h-52 rounded-full flex flex-col items-center justify-center transition-all duration-200 active:scale-95 disabled:opacity-50"
            style={{
              background: clockedOut ? 'var(--color-solid-hover)' : 'var(--color-solid)',
              boxShadow: '0 4px 24px rgba(0,0,0,0.15), 0 0 0 6px rgba(0,0,0,0.04)',
            }}
          >
            <span className="font-mono text-2xl sm:text-3xl font-bold" style={{ color: 'var(--color-solid-text)' }}>
              {acting ? '打卡中' : '下班'}
            </span>
            <span className="font-mono text-sm mt-1" style={{ color: 'var(--color-solid-text)', opacity: 0.6 }}>
              {clockedOut ? '更新时间' : '点击打卡'}
            </span>
          </div>
        </button>
      )}

      <div
        className="mt-10 flex items-center gap-8 rounded-lg px-8 py-5"
        style={{ background: 'var(--color-surface-strong)', border: '1px solid var(--color-border)' }}
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
          className="mt-4 font-mono text-xs px-4 py-2 rounded-full transition-colors disabled:opacity-50"
          style={{
            border: '1px solid var(--color-border)',
            background: data?.is_overtime ? '#fee2e2' : 'transparent',
            color: data?.is_overtime ? '#dc2626' : 'var(--color-ink-muted)',
          }}
        >
          {data?.is_overtime ? '✓ 加班已标记（点击取消）' : '标记为加班'}
        </button>
      )}

      {clockedIn && !clockedOut && (
        <p className="mt-4 text-sm text-[var(--color-ink-faint)]" style={{ fontFamily: 'Georgia, serif' }}>
          已上班打卡，下班时请再次打卡
        </p>
      )}
      {clockedIn && clockedOut && (
        <p className="mt-4 text-sm text-[var(--color-ink-faint)]" style={{ fontFamily: 'Georgia, serif' }}>
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
