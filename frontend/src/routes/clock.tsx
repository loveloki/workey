import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { PageHeader } from '../components/PageHeader'
import { useAuthGuard } from '../lib/useAuthGuard'
import { useToast } from '../lib/toast-context'
import { useState, useEffect } from 'react'
import { type Attendance, type AttendanceStatus } from '../lib/api'
import { formatTime, formatTodayTitle } from '../lib/date-utils'
import { LoadingScreen } from '../components/LoadingScreen'
import { useI18n } from '../lib/i18n'
import { useAttendanceToday, useClockIn, useClockOut, useLeave, useSetOvertime, useSettings } from '../lib/queries'

export const Route = createFileRoute('/clock')({ component: ClockPage })

function ClockPage() {
  const { user, loading } = useAuthGuard()
  const { t } = useI18n()

  if (loading) return <LoadingScreen />
  if (!user) return null

  return (
    <main className="max-w-5xl mx-auto px-4 pb-8 pt-8">
      <PageHeader
        eyebrow={t('clock.eyebrow')}
        title={formatTodayTitle()}
        centered
      />
      <ClockWidget />
    </main>
  )
}

function ClockWidget() {
  const { data: queryData, isLoading } = useAttendanceToday()
  const { toastError } = useToast()
  const { t, locale } = useI18n()
  const [localData, setLocalData] = useState<Attendance | null | undefined>(null)
  const [now, setNow] = useState(new Date())
  const [isOvertime, setIsOvertime] = useState(false)
  const [attendanceType, setAttendanceType] = useState<AttendanceStatus>('normal')
  const navigate = useNavigate()

  const clockInMut = useClockIn()
  const clockOutMut = useClockOut()
  const leaveMut = useLeave()
  const setOvertimeMut = useSetOvertime()
  const { data: settingsData } = useSettings()

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
  const isBusinessTrip = data?.status === 'business_trip'

  // 计算预计下班时间：上班打卡时间 + 提醒延迟小时数
  let expectedClockOut: string | null = null
  if (clockedIn && !clockedOut && !isLeave && !isBusinessTrip && data?.clock_in && settingsData) {
    const delay = parseInt(settingsData.reminder_delay || '9', 10)
    const clockInDate = new Date(data.clock_in)
    if (!isNaN(clockInDate.getTime())) {
      const expected = new Date(clockInDate.getTime() + delay * 60 * 60 * 1000)
      expectedClockOut = expected.toLocaleTimeString(locale, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    }
  }

  const clockIn = async (overtime?: boolean, status: AttendanceStatus = attendanceType) => {
    try {
      const res = await clockInMut.mutateAsync({ isOvertime: overtime ?? isOvertime, status })
      setLocalData(res.attendance)
      setTimeout(() => navigate({ to: '/' }), 600)
    } catch (e: unknown) {
      toastError(e instanceof Error ? e.message : t('common.operationFailed'))
    }
  }

  const toggleTodayOvertime = async () => {
    if (!data) return
    try {
      const res = await setOvertimeMut.mutateAsync({ date: data.date, isOvertime: !data.is_overtime })
      setLocalData(res.attendance)
    } catch (e: unknown) {
      toastError(e instanceof Error ? e.message : t('common.operationFailed'))
    }
  }

  const clockOut = async () => {
    try {
      const res = await clockOutMut.mutateAsync()
      setLocalData(res.attendance)
    } catch (e: unknown) {
      toastError(e instanceof Error ? e.message : t('common.operationFailed'))
    }
  }

  const markLeave = async () => {
    try {
      const res = await leaveMut.mutateAsync()
      setLocalData(res.attendance)
    } catch (e: unknown) {
      toastError(e instanceof Error ? e.message : t('common.operationFailed'))
    }
  }

  if (isLoading) return <LoadingScreen />

  const timeStr = now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })

  return (
    <div className="flex flex-col items-center">
      <p className="font-mono text-5xl sm:text-6xl font-bold text-[var(--color-ink)] mb-8 tabular-nums tracking-wider">
        {timeStr}
      </p>

      {!clockedIn && !isLeave ? (
        <div className="flex flex-col items-center gap-6">
          <div className="flex rounded-full border border-[var(--color-border)] p-1">
            {(['normal', 'business_trip'] as const).map(type => (
              <button
                key={type}
                onClick={() => setAttendanceType(type)}
                className={`rounded-full px-4 py-2 font-mono text-sm transition-colors ${
                  attendanceType === type
                    ? 'bg-[var(--color-solid)] text-[var(--color-solid-text)]'
                    : 'text-[var(--color-ink-muted)]'
                }`}
              >
                {type === 'normal' ? t('clock.normalType') : t('clock.businessTripType')}
              </button>
            ))}
          </div>
          {attendanceType === 'normal' && (
            <label className={`flex items-center gap-2 cursor-pointer select-none px-4 py-2 rounded-full border border-[var(--color-border)] ${isOvertime ? 'bg-[var(--color-surface-strong)]' : 'bg-transparent'}`}>
              <input
                type="checkbox"
                checked={isOvertime}
                onChange={e => setIsOvertime(e.target.checked)}
                className="w-4 h-4"
              />
              <span className={`font-mono text-sm ${isOvertime ? 'text-red-600' : 'text-[var(--color-ink-muted)]'}`}>
                {t('clock.overtimeToday')}
              </span>
            </label>
          )}
          <button
            onClick={() => clockIn(undefined, attendanceType)}
            disabled={acting}
            className="group relative outline-none"
          >
            <div
              className="w-44 h-44 sm:w-52 sm:h-52 rounded-full flex flex-col items-center justify-center bg-[var(--color-solid)] shadow-[0_4px_24px_rgba(0,0,0,0.15),0_0_0_6px_rgba(0,0,0,0.04)] transition-all duration-200 active:scale-95 disabled:opacity-50"
            >
              <span className="font-mono text-2xl sm:text-3xl font-bold text-[var(--color-solid-text)]">
                {acting ? t('clock.punching') : attendanceType === 'business_trip' ? t('clock.businessTripPunchIn') : t('clock.punchIn')}
              </span>
              <span className="font-mono text-sm mt-1 text-[var(--color-solid-text)] opacity-60">
                {t('clock.tapToPunch')}
              </span>
            </div>
          </button>
          
          <button
            onClick={markLeave}
            disabled={acting}
            className="font-mono text-sm px-6 py-2 rounded-full border border-[var(--color-border)] bg-transparent text-[var(--color-ink-muted)] transition-colors active:scale-95 disabled:opacity-50"
          >
            {t('clock.takeLeaveToday')}
          </button>
        </div>
      ) : isLeave ? (
        <div className="flex flex-col items-center gap-6">
          <div
            className="w-44 h-44 sm:w-52 sm:h-52 rounded-full flex flex-col items-center justify-center border-2 border-dashed border-[var(--color-border)] bg-[var(--color-surface-strong)]"
          >
            <span className="font-mono text-2xl sm:text-3xl font-bold text-[var(--color-ink-muted)]">
              {t('clock.onLeave')}
            </span>
          </div>
          <button
            onClick={() => clockIn()}
            disabled={acting}
            className="font-mono text-sm px-6 py-2 rounded-full bg-[var(--color-solid)] text-[var(--color-solid-text)] transition-colors active:scale-95 disabled:opacity-50"
          >
            {t('clock.cancelLeaveAndPunchIn')}
          </button>
        </div>
      ) : isBusinessTrip ? (
        <div className="flex flex-col items-center gap-6">
          <div className="w-44 h-44 sm:w-52 sm:h-52 rounded-full flex flex-col items-center justify-center border-2 border-dashed border-[var(--color-border)] bg-[var(--color-surface-strong)]">
            <span className="font-mono text-2xl sm:text-3xl font-bold text-[var(--color-ink-muted)]">
              {t('clock.businessTripDone')}
            </span>
            <span className="font-mono text-sm mt-1 text-[var(--color-ink-faint)]">
              {t('clock.businessTripOnlyOnce')}
            </span>
          </div>
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
              {acting ? t('clock.punching') : t('clock.punchOut')}
            </span>
            <span className="font-mono text-sm mt-1 text-[var(--color-solid-text)] opacity-60">
              {clockedOut ? t('clock.updateTime') : t('clock.tapToPunch')}
            </span>
          </div>
        </button>
      )}

      <div
        className="mt-10 flex items-center gap-4 sm:gap-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-strong)] px-4 sm:px-8 py-5"
      >
        <div className="text-center">
          <p className="font-mono text-xs uppercase tracking-wide text-[var(--color-ink-muted)] mb-1">{t('clock.statIn')}</p>
          <p className="font-mono text-xl font-bold text-[var(--color-ink)]">{isLeave ? '--:--' : formatTime(data?.clock_in)}</p>
        </div>
        <div className="h-10 w-px bg-[var(--color-border)]" />
        <div className="text-center">
          <p className="font-mono text-xs uppercase tracking-wide text-[var(--color-ink-muted)] mb-1">{t('clock.statOut')}</p>
          <p className="font-mono text-xl font-bold text-[var(--color-ink)]">{isLeave ? '--:--' : formatTime(data?.clock_out)}</p>
        </div>
        {!isLeave && !isBusinessTrip && clockedIn && expectedClockOut && (
          <>
            <div className="h-10 w-px bg-[var(--color-border)]" />
            <div className="text-center">
              <p className="font-mono text-xs uppercase tracking-wide text-[var(--color-ink-muted)] mb-1">{t('clock.expectedOut')}</p>
              <p className="font-mono text-xl font-bold text-[var(--color-ink)]">{expectedClockOut}</p>
            </div>
          </>
        )}
        {!isLeave && !isBusinessTrip && clockedIn && data?.clock_in && data?.clock_out && (
          <>
            <div className="h-10 w-px bg-[var(--color-border)]" />
            <div className="text-center">
              <p className="font-mono text-xs uppercase tracking-wide text-[var(--color-ink-muted)] mb-1">{t('clock.duration')}</p>
              <p className="font-mono text-xl font-bold text-[var(--color-ink)]">{calcDuration(data.clock_in, data.clock_out)}</p>
            </div>
          </>
        )}
      </div>

      {clockedIn && !isLeave && !isBusinessTrip && (
        <button
          onClick={toggleTodayOvertime}
          disabled={acting}
          className={`mt-4 border border-[var(--color-border)] font-mono text-xs px-4 py-2 rounded-full transition-colors disabled:opacity-50 ${data?.is_overtime ? 'bg-red-100 text-red-600' : 'bg-transparent text-[var(--color-ink-muted)]'}`}
        >
          {data?.is_overtime ? t('clock.overtimeMarked') : t('clock.markOvertime')}
        </button>
      )}

      {clockedIn && !clockedOut && !isBusinessTrip && (
        <p className="mt-4 font-serif text-sm text-[var(--color-ink-faint)]">
          {t('clock.hintPunchOutLater')}
        </p>
      )}
      {clockedIn && clockedOut && !isBusinessTrip && (
        <p className="mt-4 font-serif text-sm text-[var(--color-ink-faint)]">
          {t('clock.hintUpdateOutTime')}
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
