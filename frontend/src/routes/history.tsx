import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '../components/PageHeader'
import { useAuthGuard } from '../lib/useAuthGuard'
import { useToast } from '../lib/toast-context'
import { useState, useEffect, useMemo, useRef } from 'react'
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
import { useI18n, type TranslationKey } from '../lib/i18n'

export const Route = createFileRoute('/history')({
  component: HistoryPage,
})


const WINDOW_RADIUS = 3 // show ±3 iterations around selected
const AUTO_SAVE_DELAY = 800

type AutoSaveState = 'idle' | 'saving' | 'saved' | 'error'

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
  const { t } = useI18n()
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
      className="rounded-md border border-[var(--color-border)] px-2 py-1.5 font-mono text-xs text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-surface-hover)] disabled:cursor-not-allowed disabled:opacity-30"
      title={label}
    >
      {label}
    </button>
  )

  return (
    <div className="mb-4 space-y-2">
      {/* Row 1: nav arrows + window buttons — scrollable on narrow screens */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:thin]">
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
          <span className="font-mono text-xs text-[var(--color-ink-muted)]">{t('history.jumpTo')}</span>
          <input
            type="number"
            min={minIter}
            max={maxIter}
            value={jumpValue}
            onChange={e => setJumpValue(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleJump()}
            placeholder={`${minIter}–${maxIter}`}
            className="w-20 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-strong)] px-2 py-1 text-center font-mono text-xs text-[var(--color-ink)] outline-none"
          />
          <button
            onClick={handleJump}
            className="rounded-md border border-[var(--color-border)] px-2.5 py-1 font-mono text-xs text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-surface-hover)]"
          >
            Go
          </button>
        </div>
        <span className="font-mono text-xs text-[var(--color-ink-faint)]">
          {currentRange.start} ~ {currentRange.end}
        </span>
      </div>
    </div>
  )
}

const PRESETS: { key: RangePreset | 'custom' | 'iteration'; labelKey: TranslationKey }[] = [
  { key: 'iteration', labelKey: 'history.preset.iteration' },
  { key: 'month', labelKey: 'history.preset.month' },
  { key: 'quarter', labelKey: 'history.preset.quarter' },
  { key: 'year', labelKey: 'history.preset.year' },
  { key: 'custom', labelKey: 'history.preset.custom' },
]

function HistoryPage() {
  const { t } = useI18n()
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
  const { data: logsData, isLoading: loadingLogs } = useWorkLogRange(currentFetchRange.start, currentFetchRange.end, rangeEnabled)
  const { data: attData, isLoading: loadingAtt } = useAttendanceRange(currentFetchRange.start, currentFetchRange.end, rangeEnabled)
  const { data: todosData, isLoading: loadingTodos } = useCompletedTodosRange(currentFetchRange.start, currentFetchRange.end, rangeEnabled)

  // 后台刷新时保留已有结果，避免自动保存触发查询失效后卸载编辑器
  const fetching = loadingLogs || loadingAtt || loadingTodos
  const logs: WorkLog[] = logsData?.work_logs ?? []
  const attendances: Attendance[] = attData?.attendances ?? []
  const completedTodos: Todo[] = todosData?.todos ?? []

  const handleCustomSearch = () => {
    if (customStart && customEnd) setActiveCustom({ start: customStart, end: customEnd })
  }

  const presets = PRESETS

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
      { includeMeta: true },
    )
  }

  /** Build markdown for all days and trigger download */
  const downloadAll = () => {
    const parts = sortedDates.map(d => getDayMarkdown(d))
    const content = '# ' + t('history.exportTitle') + '\n\n' + parts.join('\n\n')
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
      <PageHeader
        eyebrow={t('history.eyebrow')}
        title={t('history.title')}
        actions={sortedDates.length > 0 && (
          <button
            onClick={downloadAll}
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-[var(--color-border)] px-3 py-1.5 font-mono text-xs text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-surface-hover)]"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span className="hidden sm:inline">{t('history.download')}</span> .md
          </button>
        )}
      />

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
            {t(p.labelKey)}
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
                <option key={y} value={y}>{t('history.yearOption', { year: y })}</option>
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
              <option key={y} value={y}>{t('history.yearOption', { year: y })}</option>
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
          <span className="font-serif text-sm text-[var(--color-ink-muted)]">{t('history.to')}</span>
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
            {t('history.search')}
          </button>
        </div>
      )}

      {/* Results */}
      {fetching ? (
        <p className="font-mono text-sm text-[var(--color-ink-muted)]">{t('common.loading')}</p>
      ) : sortedDates.length === 0 ? (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-8 text-center">
          <p className="font-serif text-sm text-[var(--color-ink-muted)]">{t('history.empty')}</p>
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
  const { t } = useI18n()
  const [isEditing, setIsEditing] = useState(false)
  const [logContent, setLogContent] = useState('')
  const [hasEdited, setHasEdited] = useState(false)
  const [autoSaveState, setAutoSaveState] = useState<AutoSaveState>('idle')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveVersionRef = useRef(0)
  const saveLogMut = useSaveWorkLog()
  const saveMutateAsyncRef = useRef(saveLogMut.mutateAsync)
  saveMutateAsyncRef.current = saveLogMut.mutateAsync

  const handleEdit = () => {
    setLogContent((entry.log?.content || '').replace(/^\s+/, ''))
    setHasEdited(false)
    setAutoSaveState('idle')
    setIsEditing(true)
  }

  useEffect(() => {
    if (!isEditing || !hasEdited) return

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    const version = ++saveVersionRef.current
    setAutoSaveState('idle')

    saveTimerRef.current = setTimeout(async () => {
      setAutoSaveState('saving')
      try {
        await saveMutateAsyncRef.current({ date, content: logContent })
        if (version === saveVersionRef.current) {
          setAutoSaveState('saved')
        }
      } catch {
        if (version === saveVersionRef.current) {
          setAutoSaveState('error')
        }
      }
    }, AUTO_SAVE_DELAY)

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [date, isEditing, hasEdited, logContent, t])

  const statusMessage = autoSaveState === 'saving'
    ? t('common.saving')
    : autoSaveState === 'saved'
      ? t('common.savedCheck')
      : autoSaveState === 'error'
        ? t('common.saveFailed')
        : null

  const handleCancel = () => {
    setIsEditing(false)
    setHasEdited(false)
    setAutoSaveState('idle')
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
              className="rounded border border-[var(--color-border)] px-2 py-1 font-mono text-xs text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-surface-hover)]"
            >
              {t('common.edit')}
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
              <span>{t('history.clockInAt', { time: formatTime(entry.attendance.clock_in) })}</span>
              <span>{t('history.clockOutAt', { time: formatTime(entry.attendance.clock_out) })}</span>
            </div>
          )}
          <CopyButton getText={() => getDayMarkdown(date)} className="hidden sm:flex" />
        </div>
      </div>

      {isEditing ? (
        <div className="space-y-4 mt-4">
          <div>
            <p className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-ink-faint)]">{t('history.workContent')}</p>
            <MarkdownEditor
              value={logContent}
              onChange={nextContent => {
                setLogContent(nextContent)
                setHasEdited(true)
              }}
              placeholder={t('history.workContentPlaceholder')}
              rows={8}
            />
          </div>
          <div className="flex items-center gap-3 pt-2">
            {statusMessage && (
              <p aria-live="polite" className={`text-sm font-serif ${autoSaveState === 'error' ? 'text-[var(--color-danger-text)]' : 'text-[var(--color-ink-muted)]'}`}>
                {statusMessage}
              </p>
            )}
            <button
              onClick={handleCancel}
              disabled={saveLogMut.isPending}
              className="rounded-md border border-[var(--color-border)] px-5 py-2 font-mono text-sm text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)] disabled:opacity-50"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <>
          {entry.log ? (
            <div className="markdown-body mt-2 font-serif text-sm text-[var(--color-ink-secondary)]">
              <MarkdownContent content={entry.log.content} />
            </div>
          ) : (
            <p className="m-0 mt-2 font-serif text-sm italic text-[var(--color-ink-faint)]">
              {t('history.noWorkLog')}
            </p>
          )}

          {entry.todos.length > 0 && (
            <div className="mt-3 border-t border-dashed border-[var(--color-border)] pt-3">
              <p className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-ink-faint)]">{t('history.completedTodos')}</p>
              <div className="space-y-1">
                {entry.todos.map((todo) => (
                  <div key={todo.id} className="flex items-start gap-2 px-1">
                    <div
                      className="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded bg-[var(--color-solid)]"
                    >
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="var(--color-solid-text)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <span
                        className="text-sm font-serif text-[var(--color-ink-muted)]"
                      >
                        {todo.content}
                      </span>
                      {todo.url && (
                        <a
                          href={todo.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-2 font-mono text-xs text-[var(--color-ink-faint)] underline underline-offset-2"
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
  const { t } = useI18n()
  const overtimeMut = useSetOvertime()
  const { toastError } = useToast()
  if (isLeave) return null
  const toggle = async () => {
    if (overtimeMut.isPending) return
    try {
      await overtimeMut.mutateAsync({ date, isOvertime: !isOvertime })
    } catch (e: unknown) {
      toastError(e instanceof Error ? e.message : t('history.updateFailed'))
    }
  }
  return (
    <button
      onClick={toggle}
      disabled={overtimeMut.isPending}
      title={isOvertime ? t('history.overtimeUnmarkTip') : t('history.overtimeMarkTip')}
      className={`rounded px-1.5 py-0.5 text-[10px] font-bold transition-colors disabled:opacity-50 ${isOvertime ? 'border border-transparent bg-red-100 text-red-600' : 'border border-dashed border-[var(--color-border)] bg-transparent text-[var(--color-ink-faint)]'}`}
    >
      {isOvertime ? t('history.overtime') : t('history.overtimeAdd')}
    </button>
  )
}
