import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useAuth } from '../lib/auth-context'
import { useState, useEffect } from 'react'
import { workLogs as workLogsApi, attendance as attendanceApi, lessons as lessonsApi } from '../lib/api'
import { getDateRange, formatDateDisplay, formatTime, type RangePreset } from '../lib/date-utils'
import { MarkdownContent } from '../lib/markdown-editor'

export const Route = createFileRoute('/history')({
  component: HistoryPage,
})

function HistoryPage() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const [preset, setPreset] = useState<RangePreset | 'custom'>('week')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [logs, setLogs] = useState<any[]>([])
  const [attendances, setAttendances] = useState<any[]>([])
  const [lessonsList, setLessonsList] = useState<any[]>([])
  const [fetching, setFetching] = useState(false)

  useEffect(() => {
    if (!loading && !user) navigate({ to: '/login' })
  }, [loading, user, navigate])

  useEffect(() => {
    if (!user || preset === 'custom') return
    const range = getDateRange(preset as RangePreset)
    fetchData(range.start, range.end)
  }, [preset, user])

  const fetchData = async (start: string, end: string) => {
    setFetching(true)
    try {
      const [logsRes, attRes, lessonsRes] = await Promise.all([
        workLogsApi.range(start, end),
        attendanceApi.range(start, end),
        lessonsApi.range(start, end),
      ])
      setLogs(logsRes.work_logs)
      setAttendances(attRes.attendances)
      setLessonsList(lessonsRes.lessons)
    } catch (e) {
      console.error(e)
    }
    setFetching(false)
  }

  const handleCustomSearch = () => {
    if (customStart && customEnd) {
      fetchData(customStart, customEnd)
    }
  }

  const presets: { key: RangePreset | 'custom'; label: string }[] = [
    { key: 'week', label: '本周' },
    { key: 'month', label: '本月' },
    { key: 'quarter', label: '本季度' },
    { key: 'half-year', label: '半年' },
    { key: 'year', label: '全年' },
    { key: 'custom', label: '自定义' },
  ]

  // Merge logs, attendance and lessons by date
  const dateMap = new Map<string, { attendance?: any; log?: any; lesson?: any }>()
  attendances.forEach(a => {
    const entry = dateMap.get(a.date) || {}
    entry.attendance = a
    dateMap.set(a.date, entry)
  })
  logs.forEach(l => {
    const entry = dateMap.get(l.date) || {}
    entry.log = l
    dateMap.set(l.date, entry)
  })
  lessonsList.forEach(l => {
    const entry = dateMap.get(l.date) || {}
    entry.lesson = l
    dateMap.set(l.date, entry)
  })
  const sortedDates = [...dateMap.keys()].sort().reverse()

  if (loading) return null

  return (
    <main className="max-w-5xl mx-auto px-4 pb-8 pt-8">
      <div className="mb-6">
        <p className="mb-1 font-mono text-sm uppercase tracking-[0.3em] text-[var(--color-ink-secondary)]">历史记录</p>
        <h1 className="text-3xl font-normal tracking-tight text-[var(--color-ink)]" style={{ fontFamily: 'Georgia, serif' }}>
          工作回顾
        </h1>
      </div>

      {/* Preset buttons */}
      <div className="mb-4 flex flex-wrap gap-2">
        {presets.map(p => (
          <button
            key={p.key}
            onClick={() => setPreset(p.key)}
            className={`rounded-md border px-4 py-2 font-mono text-sm ${
              preset === p.key
                ? 'border-[var(--color-border-strong)] bg-[var(--color-surface-hover)] font-medium text-[var(--color-ink)]'
                : 'border-[var(--color-border)] bg-[var(--color-surface-strong)] text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)]'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Custom date range */}
      {preset === 'custom' && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={customStart}
            onChange={e => setCustomStart(e.target.value)}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3.5 font-mono text-sm text-[var(--color-ink)] focus:border-[var(--color-border-focus)] focus:outline-none"
          />
          <span className="text-sm text-[var(--color-ink-muted)]" style={{ fontFamily: 'Georgia, serif' }}>至</span>
          <input
            type="date"
            value={customEnd}
            onChange={e => setCustomEnd(e.target.value)}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3.5 font-mono text-sm text-[var(--color-ink)] focus:border-[var(--color-border-focus)] focus:outline-none"
          />
          <button
            onClick={handleCustomSearch}
            className="rounded-md bg-[var(--color-solid)] px-5 py-2.5 font-mono text-sm text-[var(--color-solid-text)] hover:bg-[var(--color-solid-hover)]"
          >
            查询
          </button>
        </div>
      )}

      {/* Results */}
      {fetching ? (
        <p className="font-mono text-sm text-[var(--color-ink-muted)]">加载中...</p>
      ) : sortedDates.length === 0 ? (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-8 text-center">
          <p className="text-sm text-[var(--color-ink-muted)]" style={{ fontFamily: 'Georgia, serif' }}>暂无记录</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedDates.map(date => {
            const entry = dateMap.get(date)!
            return (
              <div
                key={date}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-5"
              >
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="font-mono text-sm font-semibold text-[var(--color-ink)]">
                    {formatDateDisplay(date)}
                  </h3>
                  {entry.attendance && (
                    <div className="flex items-center gap-3 font-mono text-xs text-[var(--color-ink-muted)]">
                      <span>上班 {formatTime(entry.attendance.clock_in)}</span>
                      <span>下班 {formatTime(entry.attendance.clock_out)}</span>
                    </div>
                  )}
                </div>
                {entry.log ? (
                  <div className="markdown-body text-sm text-[var(--color-ink-secondary)]" style={{ fontFamily: 'Georgia, serif' }}>
                    <MarkdownContent content={entry.log.content} />
                  </div>
                ) : (
                  <p className="m-0 text-sm italic text-[var(--color-ink-faint)]" style={{ fontFamily: 'Georgia, serif' }}>
                    未记录工作内容
                  </p>
                )}
                {entry.lesson && entry.lesson.content && (
                  <div className="mt-3 border-t border-dashed border-[var(--color-border)] pt-3">
                    <p className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-ink-faint)]">💡 经验教训</p>
                    <div className="markdown-body text-sm text-[var(--color-ink-muted)]" style={{ fontFamily: 'Georgia, serif' }}>
                      <MarkdownContent content={entry.lesson.content} />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
