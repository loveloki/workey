import { useNavigate } from '@tanstack/react-router'
import { formatTime } from '../../lib/date-utils'
import type { Attendance } from '../../lib/api'
import { useSettings } from '../../lib/queries'
import { useI18n } from '../../lib/i18n'

interface AttendanceStatusBarProps {
  data: Attendance
}

export function AttendanceStatusBar({ data }: AttendanceStatusBarProps) {
  const navigate = useNavigate()
  const { t, locale } = useI18n()
  const { data: settingsData } = useSettings()

  const clockedIn = !!data.clock_in
  const clockedOut = !!data.clock_out
  const isLeave = data.status === 'leave'
  const isBusinessTrip = data.status === 'business_trip'

  // 计算预计下班时间：上班打卡时间 + 提醒延迟小时数
  let expectedClockOut: string | null = null
  if (clockedIn && !clockedOut && !isLeave && !isBusinessTrip && data.clock_in && settingsData) {
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

  return (
    <div className="flex items-center gap-3 sm:gap-6 px-4 sm:px-6 py-4">
      <div className="flex items-center gap-2">
        {data.is_overtime && <span className="bg-red-100 text-red-600 px-1.5 py-0.5 rounded text-[10px] font-bold">{t('attendance.overtime')}</span>}
        {isLeave ? (
          <span className="font-mono text-sm font-bold text-[var(--color-danger-text,#dc2626)]">{t('attendance.onLeave')}</span>
        ) : isBusinessTrip ? (
          <span className="font-mono text-sm font-bold text-[var(--color-ink)]">{t('attendance.businessTrip')}</span>
        ) : (
          <>
            <span className="font-mono text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">{t('attendance.clockIn')}</span>
            <span className="font-mono text-sm font-bold text-[var(--color-ink)]">{formatTime(data.clock_in)}</span>
          </>
        )}
      </div>
      {/* 已下班显示实际下班时间，未下班则显示预计下班时间，两者不同时出现 */}
      {!isLeave && !isBusinessTrip && (
        <>
          <div className="h-4 w-px bg-[var(--color-border)]" />
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">
              {clockedOut ? t('attendance.clockOut') : t('attendance.expected')}
            </span>
            <span className="font-mono text-sm font-bold text-[var(--color-ink)]">
              {clockedOut ? formatTime(data.clock_out) : (expectedClockOut ?? '--:--')}
            </span>
          </div>
        </>
      )}
      <div className="flex-1" />
      <button
        onClick={() => navigate({ to: '/clock' })}
        className="font-mono text-xs px-3 py-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-hover)] border border-[var(--color-border)] text-[var(--color-ink-muted)]"
      >
        {t('attendance.goClock')}
      </button>
    </div>
  )
}
