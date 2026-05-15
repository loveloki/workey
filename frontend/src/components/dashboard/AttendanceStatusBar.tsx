import { useNavigate } from '@tanstack/react-router'
import { formatTime } from '../../lib/date-utils'
import type { Attendance } from '../../lib/api'

interface AttendanceStatusBarProps {
  data: Attendance
}

export function AttendanceStatusBar({ data }: AttendanceStatusBarProps) {
  const navigate = useNavigate()

  return (
    <div className="flex items-center gap-6 px-6 py-4">
      <div className="flex items-center gap-2">
        {data.is_overtime && <span className="bg-red-100 text-red-600 px-1.5 py-0.5 rounded text-[10px] font-bold">加班</span>}
        {data.status === 'leave' ? (
          <span className="font-mono text-sm font-bold text-[var(--color-danger-text,#dc2626)]">已请假</span>
        ) : (
          <>
            <span className="font-mono text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">上班</span>
            <span className="font-mono text-sm font-bold text-[var(--color-ink)]">{formatTime(data.clock_in)}</span>
          </>
        )}
      </div>
      {data.status !== 'leave' && (
        <>
          <div className="h-4 w-px bg-[var(--color-border)]" />
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">下班</span>
            <span className="font-mono text-sm font-bold text-[var(--color-ink)]">{formatTime(data.clock_out)}</span>
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
  )
}
