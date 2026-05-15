import { createFileRoute } from '@tanstack/react-router'
import { useAuthGuard } from '../lib/useAuthGuard'
import { useToast } from '../lib/toast-context'
import { useState, useEffect, useMemo } from 'react'
import { type Todo, type Attendance, type WorkLog } from '../lib/api'
import { getDateRange, formatDate, formatDateDisplay, formatTime, type RangePreset, getIterationNumber, getIterationRange, getCurrentIteration, makeIterationConfig, type IterationConfig, type IterationOverrideMap } from '../lib/date-utils'
import {
  useSettings, useIterationOverrides, useHistoryDateRange,
  useWorkLogRange, useAttendanceRange, useCompletedTodosRange,
  useSaveWorkLog, useSetOvertime,
} from '../lib/queries'
import { MarkdownContent, MarkdownEditor } from '../lib/markdown-editor'
import { formatDayMarkdown } from '../lib/report-utils'
import { CopyButton } from '../components/CopyButton'

export const Route = createFileRoute('/history')({
  component: HistoryPage,
})


const WINDOW_RADIUS = 3 // show ±3 iterations around selected

function IterationSelector({
  selectedIter,
  minIter,
  maxIter,
  iterConfig,
  iterOverrides,
  onSelect,
}: {
  selectedIter: number
  minIter: number
  maxIter: number
  iterConfig: IterationConfig
  iterOverrides: IterationOverrideMap
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

  const currentRange = getIterationRange(selectedIter, iterConfig, iterOverrides)

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
          const range = getIterationRange(iterNum, iterConfig, iterOverrides)
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
  const { user, loading } = useAuthGuard()
  const [preset, setPreset] = useState<RangePreset | 'custom' | 'iteration'>('iteration')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [activeCustom, setActiveCustom] = useState<{ start: string; end: string } | null>(null)
  const [selectedIter, setSelectedIter] = useState<number | null>(null)

  const currentYear = new Date().getFullYear()
  const [selectedYear, setSelectedYear] = useState<number>(currentYear)
  const [selectedQuarter, setSelectedQuarter] = useState<number>(Math.floor(new Date().getMonth() / 3) + 1)

  // ── 从 TanStack Query 获取配置数据 ──
  const { data: settingsData } = useSettings(!!user)
  const { data: ovData } = useIterationOverrides(!!user)
  const { data: dateRangeData } = useHistoryDateRange(!!user)

  const iterOverrides = useMemo<IterationOverrideMap>(() => {
    if (!ovData) return {}
    const map: IterationOverrideMap = {}
    for (const o of ovData.overrides) {
      map[o.iteration_number] = { start: o.start_date, end: o.end_date }
    }
    return map
  }, [ovData])

  const iterConfig = useMemo<IterationConfig | null>(() => {
    if (!settingsData) return null
    return makeIterationConfig(settingsData.iteration_start_date, settingsData.iteration_duration_days)
  }, [settingsData])

  const maxIter = iterConfig ? getCurrentIteration(iterConfig, iterOverrides) : null

  // 初始化 selectedIter
  useEffect(() => {
    if (iterConfig && selectedIter === null) {
      setSelectedIter(getCurrentIteration(iterConfig, iterOverrides))
    }
  }, [iterConfig, iterOverrides, selectedIter])

  // 从 dateRange 派生 minIter 和 availableYears
  const { minIter, availableYears } = useMemo(() => {
    if (!dateRangeData?.earliest || !iterConfig) {
      return { minIter: null, availableYears: [currentYear] }
    }
    const earliestDate = new Date(dateRangeData.earliest + 'T00:00:00')
    const mi = getIterationNumber(earliestDate, iterConfig, iterOverrides)
    const earliestYear = earliestDate.getFullYear()
    const cy = new Date().getFullYear()
    const years: number[] = []
    for (let y = cy; y >= earliestYear; y--) years.push(y)
    if (years.length === 0) years.push(cy)
    return { minIter: mi, availableYears: years }
  }, [dateRangeData, iterConfig, iterOverrides, currentYear])

  // ── 计算当前查询的日期范围 ──
  const currentFetchRange = useMemo(() => {
    if (preset === 'custom' && activeCustom) return activeCustom
    if (preset === 'iteration' && iterConfig && selectedIter !== null) {
      return getIterationRange(selectedIter, iterConfig, iterOverrides)
    }
    if (preset === 'month') return getDateRange('month')
    if (preset === 'quarter') {
      const startMonth = (selectedQuarter - 1) * 3
      const sd = new Date(selectedYear, startMonth, 1)
      const ed = new Date(selectedYear, startMonth + 3, 0)
      return { start: formatDate(sd), end: formatDate(ed) }
    }
    if (preset === 'year') {
      const sd = new Date(selectedYear, 0, 1)
      const ed = new Date(selectedYear, 11, 31)
      return { start: formatDate(sd), end: formatDate(ed) }
    }
    return { start: '', end: '' }
  }, [preset, activeCustom, iterConfig, selectedIter, iterOverrides, selectedYear, selectedQuarter])

  // ── 用计算出的范围查询数据 ──
  const rangeEnabled = !!user && !!currentFetchRange.start && !!currentFetchRange.end
  const { data: logsData, isFetching: fetchingLogs } = useWorkLogRange(currentFetchRange.start, currentFetchRange.end, rangeEnabled)
  const { data: attData, isFetching: fetchingAtt } = useAttendanceRange(currentFetchRange.start, currentFetchRange.end, rangeEnabled)
  const { data: todosData, isFetching: fetchingTodos } = useCompletedTodosRange(currentFetchRange.start, currentFetchRange.end, rangeEnabled)

  const fetching = fetchingLogs || fetchingAtt || fetchingTodos
  const logs: WorkLog[] = logsData?.work_logs ?? []
  const attendances: Attendance[] = attData?.attendances ?? []
  const completedTodos: Todo[] = todosData?.todos ?? []

  const handleCustomSearch = () => {
    if (customStart && customEnd) setActiveCustom({ start: customStart, end: customEnd })
  }

  const presets: { key: RangePreset | 'custom' | 'iteration'; label: string }[] = [
    { key: 'iteration', label: '本 iteration' },
    { key: 'month', label: '本月' },
    { key: 'quarter', label: '季度' },
    { key: 'year', label: '年度' },
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

  // Merge logs, attendance and todos by date
  const dateMap = new Map<string, { attendance?: Attendance; log?: WorkLog; todos: Todo[] }>()
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
      entry.attendance ?? null,
      entry.log?.content || '',
      entry.todos,
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
          iterOverrides={iterOverrides}
          onSelect={setSelectedIter}
        />
      )}

      {/* Quarter selector */}
      {preset === 'quarter' && (
        <div className="mb-4 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(parseInt(e.target.value, 10))}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 font-mono text-sm text-[var(--color-ink)] focus:outline-none"
            >
              {availableYears.map(y => (
                <option key={y} value={y}>{y} 年</option>
              ))}
            </select>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {[1, 2, 3, 4].map(q => (
                <button
                  key={q}
                  onClick={() => setSelectedQuarter(q)}
                  className={`rounded-md border px-3 py-1.5 font-mono text-xs transition-colors ${
                    selectedQuarter === q
                      ? 'border-[var(--color-border-strong)] bg-[var(--color-surface-hover)] font-medium text-[var(--color-ink)]'
                      : 'border-[var(--color-border)] bg-[var(--color-surface-strong)] text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)]'
                  }`}
                >
                  {selectedYear}Q{q}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Year selector */}
      {preset === 'year' && (
        <div className="mb-4">
          <select
            value={selectedYear}
            onChange={e => setSelectedYear(parseInt(e.target.value, 10))}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 font-mono text-sm text-[var(--color-ink)] focus:outline-none"
          >
            {availableYears.map(y => (
              <option key={y} value={y}>{y} 年</option>
            ))}
          </select>
        </div>
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
            return <HistoryEntry key={date} date={date} entry={entry} getDayMarkdown={getDayMarkdown} />
          })}
        </div>
      )}
    </main>
  )
}

interface HistoryEntryData {
  attendance?: Attendance
  log?: WorkLog
  todos: Todo[]
}

function HistoryEntry({ date, entry, getDayMarkdown }: { date: string, entry: HistoryEntryData, getDayMarkdown: (d: string) => string }) {
  const [isEditing, setIsEditing] = useState(false)
  const [logContent, setLogContent] = useState('')
  const saveLogMut = useSaveWorkLog()
  const { toastError } = useToast()

  const handleEdit = () => {
    setLogContent((entry.log?.content || '').replace(/^\s+/, ''))
    setIsEditing(true)
  }

  const handleSave = async () => {
    try {
      await saveLogMut.mutateAsync({ date, content: logContent })
      setIsEditing(false)
    } catch (e: unknown) {
      toastError('保存失败: ' + (e instanceof Error ? e.message : '未知错误'))
    }
  }

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-5">
      <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h3 className="font-mono text-sm font-semibold text-[var(--color-ink)]">
            {formatDateDisplay(date)}
          </h3>
          <CopyButton getText={() => getDayMarkdown(date)} className="sm:hidden" />
          {!isEditing && (
            <button
              onClick={handleEdit}
              className="font-mono text-xs px-2 py-1 rounded transition-colors hover:bg-[var(--color-surface-hover)] text-[var(--color-ink-muted)]"
              style={{ border: '1px solid var(--color-border)' }}
            >
              编辑
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          {entry.attendance && (
            <div className="flex items-center gap-3 font-mono text-xs text-[var(--color-ink-muted)]">
              <OvertimeBadge
                date={date}
                isOvertime={!!entry.attendance.is_overtime}
                isLeave={entry.attendance.status === 'leave'}
                onChanged={() => {}}
              />
              <span>上班 {formatTime(entry.attendance.clock_in)}</span>
              <span>下班 {formatTime(entry.attendance.clock_out)}</span>
            </div>
          )}
          <CopyButton getText={() => getDayMarkdown(date)} className="hidden sm:flex" />
        </div>
      </div>

      {isEditing ? (
        <div className="space-y-4 mt-4">
          <div>
            <p className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-ink-faint)]">工作内容</p>
            <MarkdownEditor
              value={logContent}
              onChange={setLogContent}
              placeholder="记录工作内容..."
              rows={8}
            />
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={saveLogMut.isPending}
              className="rounded-md bg-[var(--color-solid)] px-5 py-2 font-mono text-sm text-[var(--color-solid-text)] hover:bg-[var(--color-solid-hover)] disabled:opacity-50"
            >
              {saveLogMut.isPending ? '保存中...' : '保存修改'}
            </button>
            <button
              onClick={() => setIsEditing(false)}
              disabled={saveLogMut.isPending}
              className="rounded-md border border-[var(--color-border)] px-5 py-2 font-mono text-sm text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)] disabled:opacity-50"
            >
              取消
            </button>
          </div>
        </div>
      ) : (
        <>
          {entry.log ? (
            <div className="markdown-body text-sm text-[var(--color-ink-secondary)] mt-2" style={{ fontFamily: 'Georgia, serif' }}>
              <MarkdownContent content={entry.log.content} />
            </div>
          ) : (
            <p className="m-0 mt-2 text-sm italic text-[var(--color-ink-faint)]" style={{ fontFamily: 'Georgia, serif' }}>
              未记录工作内容
            </p>
          )}

          {entry.todos.length > 0 && (
            <div className="mt-3 border-t border-dashed border-[var(--color-border)] pt-3">
              <p className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-ink-faint)]">§ 已完成待办 §</p>
              <div className="space-y-1">
                {entry.todos.map((todo) => (
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

        </>
      )}
    </div>
  )
}

function OvertimeBadge({ date, isOvertime, isLeave }: { date: string, isOvertime: boolean, isLeave: boolean, onChanged?: () => void }) {
  const overtimeMut = useSetOvertime()
  const { toastError } = useToast()
  if (isLeave) return null
  const toggle = async () => {
    if (overtimeMut.isPending) return
    try {
      await overtimeMut.mutateAsync({ date, isOvertime: !isOvertime })
    } catch (e: unknown) {
      toastError(e instanceof Error ? e.message : '更新失败')
    }
  }
  return (
    <button
      onClick={toggle}
      disabled={overtimeMut.isPending}
      title={isOvertime ? '点击取消加班标记' : '点击标记为加班'}
      className="px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors disabled:opacity-50"
      style={{
        background: isOvertime ? '#fee2e2' : 'transparent',
        color: isOvertime ? '#dc2626' : 'var(--color-ink-faint)',
        border: isOvertime ? '1px solid transparent' : '1px dashed var(--color-border)',
      }}
    >
      {isOvertime ? '加班' : '+ 加班'}
    </button>
  )
}
