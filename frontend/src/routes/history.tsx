import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useAuth } from '../lib/auth-context'
import { useState, useEffect } from 'react'
import { workLogs as workLogsApi, attendance as attendanceApi } from '../lib/api'
import { getDateRange, formatDateDisplay, formatTime, type RangePreset } from '../lib/date-utils'

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
      const [logsRes, attRes] = await Promise.all([
        workLogsApi.range(start, end),
        attendanceApi.range(start, end),
      ])
      setLogs(logsRes.work_logs)
      setAttendances(attRes.attendances)
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

  // Merge logs and attendance by date
  const dateMap = new Map<string, { attendance?: any; log?: any }>()
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
  const sortedDates = [...dateMap.keys()].sort().reverse()

  if (loading) return null

  return (
    <main className="page-wrap px-4 pb-8 pt-8">
      <div className="rise-in mb-6">
        <p className="island-kicker mb-1">历史记录</p>
        <h1 className="display-title text-3xl font-bold tracking-tight text-[var(--sea-ink)]">
          工作回顾
        </h1>
      </div>

      {/* Preset buttons */}
      <div className="rise-in mb-4 flex flex-wrap gap-2" style={{ animationDelay: '80ms' }}>
        {presets.map(p => (
          <button
            key={p.key}
            onClick={() => setPreset(p.key)}
            className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition hover:-translate-y-0.5 ${
              preset === p.key
                ? 'border-[rgba(50,143,151,0.3)] bg-[rgba(79,184,178,0.14)] text-[var(--lagoon-deep)]'
                : 'border-[var(--line)] bg-[var(--surface)] text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Custom date range */}
      {preset === 'custom' && (
        <div className="rise-in mb-4 flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={customStart}
            onChange={e => setCustomStart(e.target.value)}
            className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--sea-ink)] focus:border-[var(--lagoon)] focus:outline-none"
          />
          <span className="text-sm text-[var(--sea-ink-soft)]">至</span>
          <input
            type="date"
            value={customEnd}
            onChange={e => setCustomEnd(e.target.value)}
            className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--sea-ink)] focus:border-[var(--lagoon)] focus:outline-none"
          />
          <button
            onClick={handleCustomSearch}
            className="rounded-full border border-[rgba(50,143,151,0.3)] bg-[rgba(79,184,178,0.14)] px-4 py-2 text-xs font-semibold text-[var(--lagoon-deep)] transition hover:-translate-y-0.5 hover:bg-[rgba(79,184,178,0.24)]"
          >
            查询
          </button>
        </div>
      )}

      {/* Results */}
      {fetching ? (
        <p className="text-sm text-[var(--sea-ink-soft)]">加载中...</p>
      ) : sortedDates.length === 0 ? (
        <div className="island-shell rise-in rounded-2xl p-8 text-center">
          <p className="text-sm text-[var(--sea-ink-soft)]">暂无记录</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedDates.map((date, i) => {
            const entry = dateMap.get(date)!
            return (
              <div
                key={date}
                className="island-shell rise-in rounded-2xl p-5"
                style={{ animationDelay: `${Math.min(i, 10) * 50 + 100}ms` }}
              >
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-[var(--sea-ink)]">
                    {formatDateDisplay(date)}
                  </h3>
                  {entry.attendance && (
                    <div className="flex items-center gap-3 text-xs text-[var(--sea-ink-soft)]">
                      <span>上班 {formatTime(entry.attendance.clock_in)}</span>
                      <span>下班 {formatTime(entry.attendance.clock_out)}</span>
                    </div>
                  )}
                </div>
                {entry.log ? (
                  <p className="m-0 whitespace-pre-wrap text-sm text-[var(--sea-ink-soft)]">
                    {entry.log.content}
                  </p>
                ) : (
                  <p className="m-0 text-sm italic text-[var(--sea-ink-soft)] opacity-50">
                    未记录工作内容
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
