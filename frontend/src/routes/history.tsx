import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useAuth } from '../lib/auth-context'
import { useState, useEffect } from 'react'
import { workLogs as workLogsApi, attendance as attendanceApi, lessons as lessonsApi, todos as todosApi, history as historyApi, type Todo } from '../lib/api'
import { getDateRange, formatDateDisplay, formatTime, type RangePreset, getIterationNumber, getIterationRange, getCurrentIteration, makeIterationConfig, type IterationConfig } from '../lib/date-utils'
import { settings as settingsApi } from '../lib/api'
import { MarkdownContent } from '../lib/markdown-editor'
import { formatDayMarkdown } from '../lib/report-utils'

export const Route = createFileRoute('/history')({
  component: HistoryPage,
})

function CopyButton({ getText, className = '' }: { getText: () => Promise<string> | string; className?: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    const text = await getText()
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={handleCopy}
      className={`font-mono text-xs px-3 py-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-hover)] shrink-0 whitespace-nowrap ${className}`}
      style={{ border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-ink-muted)' }}
      title="复制为 Markdown"
    >
      {copied ? '✓ 已复制' : (
        <span className="flex items-center gap-1">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          复制
        </span>
      )}
    </button>
  )
}

const WINDOW_RADIUS = 3 // show ±3 iterations around selected

function IterationSelector({
  selectedIter,
  minIter,
  maxIter,
  iterConfig,
  onSelect,
}: {
  selectedIter: number
  minIter: number
  maxIter: number
  iterConfig: IterationConfig
  onSelect: (n: number) => void
}) {
  const [jumpValue, setJumpValue] = useState('')

  const clamp = (n: number) => Math.max(minIter, Math.min(maxIter, n))

  // Window range — descending order (newest on left, oldest on right)
  const winStart = Math.max(minIter, selectedIter - WINDOW_RADIUS)
  const winEnd = Math.min(maxIter, selectedIter + WINDOW_RADIUS)
  const windowIters: number[] = []
  for (let i = winEnd; i >= winStart; i--) windowIters.push(i)

  const handleJump = () => {
    const n = parseInt(jumpValue, 10)
    if (!isNaN(n) && n >= minIter && n <= maxIter) {
      onSelect(n)
      setJumpValue('')
    }
  }

  const currentRange = getIterationRange(selectedIter, iterConfig)

  const navBtn = (label: string, target: number, disabled: boolean) => (
    <button
      onClick={() => onSelect(target)}
      disabled={disabled}
      className="rounded-md border px-2 py-1.5 font-mono text-xs transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[var(--color-surface-hover)]"
      style={{ border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-ink-muted)' }}
      title={label}
    >
      {label}
    </button>
  )

  return (
    <div className="mb-4 space-y-2">
      {/* Row 1: nav arrows + window buttons — scrollable on narrow screens */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'thin' }}>
        {navBtn('«', maxIter, selectedIter === maxIter)}
        {navBtn('‹', clamp(selectedIter + 1), selectedIter === maxIter)}

        {windowIters.map(iterNum => {
          const range = getIterationRange(iterNum, iterConfig)
          return (
            <button
              key={iterNum}
              onClick={() => onSelect(iterNum)}
              className={`rounded-md border px-3 py-1.5 font-mono text-xs whitespace-nowrap shrink-0 transition-colors ${
                selectedIter === iterNum
                  ? 'border-[var(--color-border-strong)] bg-[var(--color-surface-hover)] font-medium text-[var(--color-ink)]'
                  : 'border-[var(--color-border)] bg-[var(--color-surface-strong)] text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)]'
              }`}
            >
              {range.label}
            </button>
          )
        })}

        {navBtn('›', clamp(selectedIter - 1), selectedIter === minIter)}
        {navBtn('»', minIter, selectedIter === minIter)}
      </div>

      {/* Row 2: jump input + date range hint */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs" style={{ color: 'var(--color-ink-muted)' }}>跳转到</span>
          <input
            type="number"
            min={minIter}
            max={maxIter}
            value={jumpValue}
            onChange={e => setJumpValue(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleJump()}
            placeholder={`${minIter}–${maxIter}`}
            className="font-mono text-xs px-2 py-1 w-20 bg-[var(--color-surface-strong)] text-center"
            style={{ border: '1px solid var(--color-border)', borderRadius: '6px', outline: 'none', color: 'var(--color-ink)' }}
          />
          <button
            onClick={handleJump}
            className="font-mono text-xs px-2.5 py-1 rounded-md transition-colors hover:bg-[var(--color-surface-hover)]"
            style={{ border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-ink-muted)' }}
          >
            Go
          </button>
        </div>
        <span className="font-mono text-xs" style={{ color: 'var(--color-ink-faint)' }}>
          {currentRange.start} ~ {currentRange.end}
        </span>
      </div>
    </div>
  )
}

function HistoryPage() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const [preset, setPreset] = useState<RangePreset | 'custom' | 'iteration'>('week')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [logs, setLogs] = useState<any[]>([])
  const [attendances, setAttendances] = useState<any[]>([])
  const [lessonsList, setLessonsList] = useState<any[]>([])
  const [completedTodos, setCompletedTodos] = useState<Todo[]>([])
  const [fetching, setFetching] = useState(false)
  // Iteration config from settings
  const [iterConfig, setIterConfig] = useState<IterationConfig | null>(null)
  // Iteration state
  const [selectedIter, setSelectedIter] = useState<number | null>(null)
  const [minIter, setMinIter] = useState<number | null>(null)
  const [maxIter, setMaxIter] = useState<number | null>(null)

  useEffect(() => {
    if (!loading && !user) navigate({ to: '/login' })
  }, [loading, user, navigate])

  // Load iteration config from settings
  useEffect(() => {
    if (!user) return
    settingsApi.get().then(data => {
      const cfg = makeIterationConfig(data.iteration_start_date, data.iteration_duration_days)
      setIterConfig(cfg)
      const cur = getCurrentIteration(cfg)
      setSelectedIter(cur)
      setMaxIter(cur)
    }).catch(console.error)
  }, [user])

  // Load history date range to determine available iterations
  useEffect(() => {
    if (!user || !iterConfig) return
    historyApi.dateRange().then(res => {
      if (res.earliest) {
        const earliestDate = new Date(res.earliest + 'T00:00:00')
        setMinIter(getIterationNumber(earliestDate, iterConfig))
      }
    }).catch(console.error)
  }, [user, iterConfig])

  useEffect(() => {
    if (!user || preset === 'custom' || preset === 'iteration') return
    const range = getDateRange(preset as RangePreset)
    fetchData(range.start, range.end)
  }, [preset, user])

  // Fetch data when iteration changes
  useEffect(() => {
    if (!user || preset !== 'iteration' || !iterConfig || selectedIter === null) return
    const range = getIterationRange(selectedIter, iterConfig)
    fetchData(range.start, range.end)
  }, [selectedIter, preset, user, iterConfig])

  const fetchData = async (start: string, end: string) => {
    setFetching(true)
    try {
      const [logsRes, attRes, lessonsRes, todosRes] = await Promise.all([
        workLogsApi.range(start, end),
        attendanceApi.range(start, end),
        lessonsApi.range(start, end),
        todosApi.completedRange(start, end),
      ])
      setLogs(logsRes.work_logs)
      setAttendances(attRes.attendances)
      setLessonsList(lessonsRes.lessons)
      setCompletedTodos(todosRes.todos || [])
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

  const presets: { key: RangePreset | 'custom' | 'iteration'; label: string }[] = [
    { key: 'week', label: '本周' },
    { key: 'month', label: '本月' },
    { key: 'iteration', label: 'Iteration' },
    { key: 'quarter', label: '本季度' },
    { key: 'half-year', label: '半年' },
    { key: 'year', label: '全年' },
    { key: 'custom', label: '自定义' },
  ]

  // Group completed todos by date (using updated_at)
  const todosByDate = new Map<string, Todo[]>()
  completedTodos.forEach(t => {
    const d = (t.updated_at || t.created_at).split('T')[0].split(' ')[0]
    const arr = todosByDate.get(d) || []
    arr.push(t)
    todosByDate.set(d, arr)
  })

  // Merge logs, attendance, lessons and todos by date
  const dateMap = new Map<string, { attendance?: any; log?: any; lesson?: any; todos: Todo[] }>()
  attendances.forEach(a => {
    const entry = dateMap.get(a.date) || { todos: [] }
    entry.attendance = a
    dateMap.set(a.date, entry)
  })
  logs.forEach(l => {
    const entry = dateMap.get(l.date) || { todos: [] }
    entry.log = l
    dateMap.set(l.date, entry)
  })
  lessonsList.forEach(l => {
    const entry = dateMap.get(l.date) || { todos: [] }
    entry.lesson = l
    dateMap.set(l.date, entry)
  })
  todosByDate.forEach((todos, date) => {
    const entry = dateMap.get(date) || { todos: [] }
    entry.todos = todos
    dateMap.set(date, entry)
  })
  const sortedDates = [...dateMap.keys()].sort().reverse()

  /** Build markdown for a single day */
  const getDayMarkdown = (date: string) => {
    const entry = dateMap.get(date)!
    return formatDayMarkdown(
      date,
      entry.attendance,
      entry.log?.content || '',
      entry.todos,
      entry.lesson?.content || '',
    )
  }

  /** Build markdown for all days and trigger download */
  const downloadAll = () => {
    const parts = sortedDates.map(d => getDayMarkdown(d))
    const content = '# 工作记录\n\n' + parts.join('\n---\n\n')
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const first = sortedDates[sortedDates.length - 1] || 'export'
    const last = sortedDates[0] || 'export'
    a.download = `work-log_${first}_${last}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return null

  return (
    <main className="max-w-5xl mx-auto px-4 pb-8 pt-8">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <p className="mb-1 font-mono text-sm uppercase tracking-[0.3em] text-[var(--color-ink-secondary)]">历史记录</p>
          <h1 className="text-3xl font-normal tracking-tight text-[var(--color-ink)]" style={{ fontFamily: 'Georgia, serif' }}>
            工作回顾
          </h1>
        </div>
        {sortedDates.length > 0 && (
          <button
            onClick={downloadAll}
            className="mt-2 flex items-center gap-1.5 font-mono text-xs px-3 py-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-hover)] shrink-0 whitespace-nowrap"
            style={{ border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-ink-muted)' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span className="hidden sm:inline">下载</span> .md
          </button>
        )}
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

      {/* Iteration selector — windowed buttons + jump input */}
      {preset === 'iteration' && minIter !== null && maxIter !== null && iterConfig && selectedIter !== null && (
        <IterationSelector
          selectedIter={selectedIter}
          minIter={minIter}
          maxIter={maxIter}
          iterConfig={iterConfig}
          onSelect={setSelectedIter}
        />
      )}

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
                <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center justify-between sm:justify-start">
                    <h3 className="font-mono text-sm font-semibold text-[var(--color-ink)]">
                      {formatDateDisplay(date)}
                    </h3>
                    <CopyButton getText={() => getDayMarkdown(date)} className="sm:hidden" />
                  </div>
                  <div className="flex items-center gap-3">
                    {entry.attendance && (
                      <div className="flex items-center gap-3 font-mono text-xs text-[var(--color-ink-muted)]">
                        <span>上班 {formatTime(entry.attendance.clock_in)}</span>
                        <span>下班 {formatTime(entry.attendance.clock_out)}</span>
                      </div>
                    )}
                    <CopyButton getText={() => getDayMarkdown(date)} className="hidden sm:flex" />
                  </div>
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
                {entry.todos.length > 0 && (
                  <div className="mt-3 border-t border-dashed border-[var(--color-border)] pt-3">
                    <p className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-ink-faint)]">§ 已完成待办 §</p>
                    <div className="space-y-1">
                      {entry.todos.map(todo => (
                        <div key={todo.id} className="flex items-start gap-2 px-1">
                          <div
                            className="w-3.5 h-3.5 mt-0.5 rounded flex items-center justify-center shrink-0"
                            style={{ background: 'var(--color-solid)' }}
                          >
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="var(--color-solid-text)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <span
                              className="text-sm"
                              style={{ color: 'var(--color-ink-muted)', fontFamily: 'Georgia, serif' }}
                            >
                              {todo.content}
                            </span>
                            {todo.url && (
                              <a
                                href={todo.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-mono text-xs ml-2"
                                style={{ color: 'var(--color-ink-faint)', textDecoration: 'underline', textUnderlineOffset: '2px' }}
                              >
                                ⇗
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {entry.lesson && entry.lesson.content && (
                  <div className="mt-3 border-t border-dashed border-[var(--color-border)] pt-3">
                    <p className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-ink-faint)]">§ 经验教训 §</p>
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
