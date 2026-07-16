import { useState, useMemo, useRef, useEffect } from 'react'
import type { IterationRange } from '../../lib/models.gen'
import { useDeleteIterationOverride, useIterations, useSaveIterationOverride } from '../../lib/queries'
import { getToday, formatDateFull } from '../../lib/date-utils'
import { useToast } from '../../lib/toast-context'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
const MONTH_NAMES = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月']

// 8 种高对比度迭代颜色（循环使用）
const ITER_COLORS = [
  { fill: 'rgba(59, 130, 246, 0.18)', border: '#3b82f6', text: '#3b82f6' },
  { fill: 'rgba(16, 185, 129, 0.18)', border: '#10b981', text: '#10b981' },
  { fill: 'rgba(245, 158, 11, 0.18)', border: '#f59e0b', text: '#f59e0b' },
  { fill: 'rgba(139, 92, 246, 0.18)', border: '#8b5cf6', text: '#8b5cf6' },
  { fill: 'rgba(236, 72, 153, 0.18)', border: '#ec4899', text: '#ec4899' },
  { fill: 'rgba(249, 115, 22, 0.18)', border: '#f97316', text: '#f97316' },
  { fill: 'rgba(6, 182, 212, 0.18)', border: '#06b6d4', text: '#06b6d4' },
  { fill: 'rgba(132, 204, 22, 0.18)', border: '#84cc16', text: '#84cc16' },
]

function getIterStyle(iterNum: number) {
  return ITER_COLORS[iterNum % ITER_COLORS.length]
}

function getDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function monthStartDow(year: number, month: number): number {
  return new Date(year, month, 1).getDay()
}

function isWeekend(dateStr: string): boolean {
  const d = new Date(dateStr + 'T00:00:00')
  return d.getDay() === 0 || d.getDay() === 6
}

/** 构建 date → IterationRange 的快速查找 Map */
function buildDateIterMap(iterations: IterationRange[]): Map<string, IterationRange> {
  const map = new Map<string, IterationRange>()
  for (const iter of iterations) {
    const start = new Date(iter.start_date + 'T00:00:00')
    const end = new Date(iter.end_date + 'T00:00:00')
    const cur = new Date(start)
    while (cur <= end) {
      map.set(cur.toISOString().slice(0, 10), iter)
      cur.setDate(cur.getDate() + 1)
    }
  }
  return map
}

// ─── 月视图日历网格 ─────────────────────────────────────

function MonthlyGrid({
  year,
  month,
  dateIterMap,
  currentNumber,
  today,
  onDateClick,
}: {
  year: number
  month: number
  dateIterMap: Map<string, IterationRange>
  currentNumber: number
  today: string
  onDateClick: (date: string, iter: IterationRange) => void
}) {
  const days = daysInMonth(year, month)
  const startDow = monthStartDow(year, month)
  const weeks = Math.ceil((days + startDow) / 7)
  const totalCells = weeks * 7

  return (
    <div>
      {/* 星期列头 */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map(w => (
          <div key={w} className="text-center font-mono text-[10px] text-[var(--color-ink-muted)] py-1">
            {w}
          </div>
        ))}
      </div>

      {/* 日期网格 */}
      <div className="grid grid-cols-7 gap-px">
        {Array.from({ length: totalCells }).map((_, i) => {
          const dayNum = i - startDow + 1
          if (dayNum < 1 || dayNum > days) return <div key={i} />
          const dateStr = getDateStr(year, month, dayNum)
          const iter = dateIterMap.get(dateStr)
          const isToday = dateStr === today
          const weekend = new Date(dateStr + 'T00:00:00').getDay()
          const isWeekendDay = weekend === 0 || weekend === 6
          const colorStyle = iter ? getIterStyle(iter.iteration_number) : null
          const isCurrentIter = iter && iter.iteration_number === currentNumber

          return (
            <div
              key={i}
              onClick={() => iter && onDateClick(dateStr, iter)}
              className={`
                aspect-square relative flex flex-col items-center justify-start pt-1.5 rounded-sm
                transition-all duration-75 select-none
                ${iter ? 'cursor-pointer hover:scale-105 hover:z-10' : 'opacity-30'}
                ${isToday ? 'ring-2 ring-[var(--color-danger)] ring-offset-1 ring-offset-[var(--color-surface-strong)]' : ''}
                ${isCurrentIter ? 'shadow-sm' : ''}
              `}
              style={
                colorStyle
                  ? { backgroundColor: colorStyle.fill, borderLeft: `3px solid ${colorStyle.border}` }
                  : {}
              }
              title={iter ? `Iter ${iter.iteration_number} · ${formatDateFull(dateStr)}` : formatDateFull(dateStr)}
            >
              <span className={`font-mono text-xs leading-none ${isToday ? 'font-bold text-[var(--color-danger)]' : isWeekendDay ? 'text-[var(--color-ink-faint)]' : 'text-[var(--color-ink)]'}`}>
                {dayNum}
              </span>
              {iter && (
                <span className="font-mono text-[8px] leading-none mt-0.5 px-0.5 rounded-sm" style={{ color: colorStyle?.text, backgroundColor: colorStyle?.border + '22' }}>
                  {iter.iteration_number}
                </span>
              )}
              {iter && dateStr === iter.start_date && (
                <span className="absolute bottom-0.5 left-0.5 font-mono text-[6px] leading-none text-[var(--color-ink-muted)]">S</span>
              )}
              {iter && dateStr === iter.end_date && (
                <span className="absolute bottom-0.5 right-0.5 font-mono text-[6px] leading-none text-[var(--color-ink-muted)]">E</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── 年视图（12个月迷你网格） ──────────────────────────

function YearlyGrid({
  year,
  dateIterMap,
  currentNumber,
  today,
  onMonthClick,
}: {
  year: number
  dateIterMap: Map<string, IterationRange>
  currentNumber: number
  today: string
  onMonthClick: (month: number) => void
}) {
  const todayDate = new Date(today + 'T00:00:00')
  const currentMonth = todayDate.getMonth()
  const currentYear = todayDate.getFullYear()

  return (
    <div className="grid grid-cols-4 gap-4">
      {Array.from({ length: 12 }).map((_, month) => {
        const days = daysInMonth(year, month)
        const startDow = monthStartDow(year, month)
        const weeks = Math.ceil((days + startDow) / 7)
        const totalCells = weeks * 7
        const isCurrentMonth = year === currentYear && month === currentMonth

        return (
          <div key={month} onClick={() => onMonthClick(month)}
            className={`rounded-lg border p-2 cursor-pointer transition-all hover:shadow-md ${isCurrentMonth ? 'border-[var(--color-border-strong)] bg-[var(--color-surface)] ring-1 ring-[var(--color-border-focus)]' : 'border-[var(--color-border)] bg-[var(--color-surface-strong)] hover:bg-[var(--color-surface)]'}`}>
            <div className="text-center font-mono text-[11px] font-semibold text-[var(--color-ink-secondary)] mb-1.5">
              {MONTH_NAMES[month]}
            </div>
            <div className="grid grid-cols-7 mb-px">
              {WEEKDAYS.map(w => (
                <div key={w} className="text-center font-mono text-[6px] text-[var(--color-ink-faint)] leading-none py-0.5">{w}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-[1px]">
              {Array.from({ length: totalCells }).map((_, i) => {
                const dayNum = i - startDow + 1
                if (dayNum < 1 || dayNum > days) return <div key={i} className="aspect-square" />
                const dateStr = getDateStr(year, month, dayNum)
                const iter = dateIterMap.get(dateStr)
                const isToday = dateStr === today
                const colorStyle = iter ? getIterStyle(iter.iteration_number) : null
                return (
                  <div key={i} className="aspect-square rounded-sm relative"
                    style={colorStyle ? { backgroundColor: colorStyle.fill } : { backgroundColor: 'var(--color-border-subtle)', opacity: 0.3 }}
                    title={iter ? `Iter ${iter.iteration_number} · ${dateStr}` : dateStr}>
                    {isToday && <div className="absolute inset-0 rounded-sm ring-1 ring-[var(--color-danger)]" />}
                    {iter && dateStr === iter.start_date && (
                      <div className="absolute left-0 top-0 bottom-0 w-[2px] rounded-l-sm" style={{ backgroundColor: colorStyle?.border }} />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── 主组件 ─────────────────────────────────────────────

export function IterationCalendar() {
  const today = getToday()
  const { toastError, toastSuccess } = useToast()
  const { data: iterationData } = useIterations()
  const saveOverride = useSaveIterationOverride()
  const deleteOverride = useDeleteIterationOverride()

  const [viewMode, setViewMode] = useState<'month' | 'year'>('month')
  const [focusYear, setFocusYear] = useState(() => new Date().getFullYear())
  const [focusMonth, setFocusMonth] = useState(() => new Date().getMonth())

  // 年份过滤
  const years = useMemo(() => {
    const set = new Set<number>()
    for (const iter of iterationData?.iterations ?? []) {
      set.add(Number.parseInt(iter.start_date.slice(0, 4), 10))
    }
    return Array.from(set).sort()
  }, [iterationData])

  const [yearFilter, setYearFilter] = useState<number | null>(null)

  const filteredIterations = useMemo(() => {
    const all = iterationData?.iterations ?? []
    if (yearFilter === null) return all
    return all.filter(iter => Number.parseInt(iter.start_date.slice(0, 4), 10) === yearFilter)
  }, [iterationData, yearFilter])

  const dateIterMap = useMemo(() => buildDateIterMap(filteredIterations), [filteredIterations])
  const currentNumber = iterationData?.current_iteration ?? 1

  // 当前迭代进度
  const currentIterProgress = useMemo(() => {
    if (!iterationData) return null
    const cur = iterationData.iterations.find(i => i.iteration_number === currentNumber)
    if (!cur) return null
    const start = new Date(cur.start_date + 'T00:00:00')
    const end = new Date(cur.end_date + 'T00:00:00')
    const now = new Date(today + 'T00:00:00')
    const total = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1)
    const elapsed = Math.max(0, Math.min(total, Math.round((now.getTime() - start.getTime()) / 86400000) + 1))
    return { elapsed, total, pct: Math.round((elapsed / total) * 100) }
  }, [iterationData, currentNumber, today])

  // 日期搜索/跳转
  const [searchDate, setSearchDate] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  const jumpToDate = (date: string): boolean => {
    const iter = filteredIterations.find(i => date >= i.start_date && date <= i.end_date)
    if (!iter) return false
    const d = new Date(date + 'T00:00:00')
    setFocusYear(d.getFullYear())
    setFocusMonth(d.getMonth())
    setViewMode('month')
    return true
  }

  const handleDateSearch = () => {
    if (!searchDate) return
    if (!jumpToDate(searchDate)) toastError('未找到该日期所在的 Iteration')
  }

  // 覆写编辑
  const [editingIter, setEditingIter] = useState<number | null>(null)
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')
  const [showEditPanel, setShowEditPanel] = useState(false)

  const startEdit = (iteration: IterationRange) => {
    setEditingIter(iteration.iteration_number)
    setEditStart(iteration.start_date)
    setEditEnd(iteration.end_date)
    setShowEditPanel(true)
    setPopover(null)
  }

  const saveEdit = async () => {
    if (editingIter === null || !editStart || !editEnd || editStart > editEnd) {
      toastError('请填写有效的起止日期')
      return
    }
    try {
      await saveOverride.mutateAsync({ iterationNumber: editingIter, startDate: editStart, endDate: editEnd })
      setEditingIter(null)
      setShowEditPanel(false)
      toastSuccess(`Iter ${editingIter} 已手动调整`)
    } catch (error) {
      toastError(error instanceof Error ? error.message : '保存失败')
    }
  }

  const cancelEdit = () => {
    setEditingIter(null)
    setShowEditPanel(false)
  }

  const removeOverrideLocal = async (number: number) => {
    try {
      await deleteOverride.mutateAsync(number)
      toastSuccess(`Iter ${number} 已恢复自动计算`)
    } catch (error) {
      toastError(error instanceof Error ? error.message : '恢复失败')
    }
  }

  // Tooltip
  const [tooltip, setTooltip] = useState<{ x: number; y: number; date: string; isWeekend: boolean } | null>(null)

  const handleMouseEnter = (e: React.MouseEvent, date: string) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setTooltip({ x: rect.left, y: rect.top - 8, date, isWeekend: isWeekend(date) })
  }
  const handleMouseLeave = () => setTooltip(null)

  // Popover
  const [popover, setPopover] = useState<{ x: number; y: number; date: string; iteration: IterationRange } | null>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  const handleCellClick = (e: React.MouseEvent, date: string, iteration: IterationRange) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    if (popover && popover.date === date && popover.iteration.iteration_number === iteration.iteration_number) {
      setPopover(null)
      return
    }
    setPopover({ x: rect.left + rect.width / 2, y: rect.top + rect.height, date, iteration })
  }

  useEffect(() => {
    if (!popover) return
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setPopover(null)
    }
    const timer = setTimeout(() => document.addEventListener('mousedown', handleClickOutside), 0)
    return () => { clearTimeout(timer); document.removeEventListener('mousedown', handleClickOutside) }
  }, [popover])

  // 导航
  const goToToday = () => {
    const d = new Date(today + 'T00:00:00')
    setFocusYear(d.getFullYear())
    setFocusMonth(d.getMonth())
    setViewMode('month')
  }

  const goPrevMonth = () => {
    if (focusMonth === 0) { setFocusYear(focusYear - 1); setFocusMonth(11) }
    else { setFocusMonth(focusMonth - 1) }
  }
  const goNextMonth = () => {
    if (focusMonth === 11) { setFocusYear(focusYear + 1); setFocusMonth(0) }
    else { setFocusMonth(focusMonth + 1) }
  }
  const goPrevYear = () => setFocusYear(focusYear - 1)
  const goNextYear = () => setFocusYear(focusYear + 1)
  const handleYearViewMonthClick = (month: number) => { setFocusMonth(month); setViewMode('month') }

  // 当月涉及的所有迭代编号（用于图例）
  const monthIterations = useMemo(() => {
    const set = new Set<number>()
    const days = daysInMonth(focusYear, focusMonth)
    for (let d = 1; d <= days; d++) {
      const iter = dateIterMap.get(getDateStr(focusYear, focusMonth, d))
      if (iter) set.add(iter.iteration_number)
    }
    return Array.from(set).sort()
  }, [focusYear, focusMonth, dateIterMap])

  if (!iterationData || iterationData.iterations.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-8 text-center font-mono text-sm text-[var(--color-ink-muted)]">
        暂无 Iteration 数据
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-4">
        {/* 进度条 */}
        {currentIterProgress && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono text-xs text-[var(--color-ink-muted)]">Iter {currentNumber} 进度</span>
              <span className="font-mono text-xs text-[var(--color-ink-muted)]">{currentIterProgress.elapsed} / {currentIterProgress.total} 天 ({currentIterProgress.pct}%)</span>
            </div>
            <div className="h-2 w-full rounded-full bg-[var(--color-surface)]">
              <div className="h-full rounded-full bg-[var(--color-solid)] transition-all duration-500" style={{ width: `${currentIterProgress.pct}%` }} />
            </div>
          </div>
        )}

        {/* 导航栏 */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {viewMode === 'month' ? (
            <>
              <button onClick={goPrevMonth} className="rounded-md border border-[var(--color-border)] px-2.5 py-1.5 font-mono text-xs text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)]">◀</button>
              <button onClick={goNextMonth} className="rounded-md border border-[var(--color-border)] px-2.5 py-1.5 font-mono text-xs text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)]">▶</button>
              <span className="font-mono text-sm font-semibold text-[var(--color-ink)] min-w-[120px] text-center">{focusYear}年{focusMonth + 1}月</span>
              <button onClick={goToToday} className="rounded-md border border-[var(--color-border)] px-2.5 py-1.5 font-mono text-xs text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)]">今天</button>
            </>
          ) : (
            <>
              <button onClick={goPrevYear} className="rounded-md border border-[var(--color-border)] px-2.5 py-1.5 font-mono text-xs text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)]">◀</button>
              <button onClick={goNextYear} className="rounded-md border border-[var(--color-border)] px-2.5 py-1.5 font-mono text-xs text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)]">▶</button>
              <span className="font-mono text-sm font-semibold text-[var(--color-ink)] min-w-[80px] text-center">{focusYear}年</span>
              <button onClick={goToToday} className="rounded-md border border-[var(--color-border)] px-2.5 py-1.5 font-mono text-xs text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)]">回到当前月</button>
            </>
          )}

          <div className="ml-auto flex items-center gap-1.5">
            {/* 视图切换 */}
            <div className="flex rounded-md border border-[var(--color-border)] overflow-hidden">
              <button onClick={() => setViewMode('month')}
                className={`px-2.5 py-1.5 font-mono text-xs transition-colors ${viewMode === 'month' ? 'bg-[var(--color-solid)] text-[var(--color-solid-text)]' : 'text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)]'}`}>月</button>
              <button onClick={() => setViewMode('year')}
                className={`px-2.5 py-1.5 font-mono text-xs transition-colors ${viewMode === 'year' ? 'bg-[var(--color-solid)] text-[var(--color-solid-text)]' : 'text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)]'}`}>年</button>
            </div>
            <input ref={searchInputRef} type="date" value={searchDate} onChange={e => setSearchDate(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleDateSearch()}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 font-mono text-xs outline-none w-32" />
            <button onClick={handleDateSearch} className="rounded-md bg-[var(--color-solid)] px-2 py-1 font-mono text-xs text-[var(--color-solid-text)]">跳转</button>
            <span className="font-mono text-[10px] text-[var(--color-ink-faint)] ml-1">过滤:</span>
            <select value={yearFilter ?? ''} onChange={e => setYearFilter(e.target.value ? Number(e.target.value) : null)}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 font-mono text-xs outline-none">
              <option value="">全部</option>
              {years.map(y => <option key={y} value={y}>{y}年</option>)}
            </select>
          </div>
        </div>

        {/* 日历主体 */}
        {viewMode === 'month' ? (
          <MonthlyGrid year={focusYear} month={focusMonth} dateIterMap={dateIterMap} currentNumber={currentNumber} today={today} onDateClick={handleCellClick} />
        ) : (
          <YearlyGrid year={focusYear} dateIterMap={dateIterMap} currentNumber={currentNumber} today={today} onMonthClick={handleYearViewMonthClick} />
        )}

        {/* 月视图迭代图例 */}
        {viewMode === 'month' && monthIterations.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-3 pt-3 border-t border-[var(--color-border)]">
            <span className="font-mono text-[10px] text-[var(--color-ink-faint)]">迭代:</span>
            {monthIterations.map(iterNum => {
              const iter = iterationData.iterations.find(i => i.iteration_number === iterNum)
              if (!iter) return null
              const color = getIterStyle(iterNum)
              const isCurrent = iterNum === currentNumber
              return (
                <div key={iterNum} onClick={() => startEdit(iter)}
                  className="flex items-center gap-1 cursor-pointer rounded-md px-1.5 py-0.5 hover:bg-[var(--color-surface-hover)] transition-colors">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color.border }} />
                  <span className={`font-mono text-[10px] ${isCurrent ? 'font-bold' : ''}`} style={{ color: color.text }}>
                    Iter {iterNum}{isCurrent && ' (当前)'}
                  </span>
                  {iter.is_overridden && <span className="rounded bg-[var(--color-success-bg)] px-1 font-mono text-[7px] text-[var(--color-success-text)] leading-none">改</span>}
                  <span className="font-mono text-[9px] text-[var(--color-ink-faint)] ml-0.5">{iter.workdays}/{iter.calendar_days}d</span>
                </div>
              )
            })}
          </div>
        )}

        {/* 全局图例 */}
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <span className="font-mono text-[10px] text-[var(--color-ink-faint)]">图例:</span>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: ITER_COLORS[0].fill, borderLeft: `3px solid ${ITER_COLORS[0].border}` }} />
            <span className="font-mono text-[10px] text-[var(--color-ink-muted)]">有迭代</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm border border-dashed border-[var(--color-border)]" />
            <span className="font-mono text-[10px] text-[var(--color-ink-muted)]">无迭代</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] font-bold text-[var(--color-danger)]">今</span>
            <span className="font-mono text-[10px] text-[var(--color-ink-muted)]">今天</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[7px] text-[var(--color-ink-muted)] bg-[var(--color-surface)] px-0.5 rounded">S</span>
            <span className="font-mono text-[10px] text-[var(--color-ink-muted)]">起始日</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[7px] text-[var(--color-ink-muted)] bg-[var(--color-surface)] px-0.5 rounded">E</span>
            <span className="font-mono text-[10px] text-[var(--color-ink-muted)]">结束日</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="rounded bg-[var(--color-success-bg)] px-1 font-mono text-[8px] text-[var(--color-success-text)] leading-none">改</span>
            <span className="font-mono text-[10px] text-[var(--color-ink-muted)]">已手动覆写</span>
          </div>
        </div>
      </div>

      {/* 内联覆写编辑面板 */}
      {showEditPanel && editingIter !== null && (
        <div className="rounded-lg border border-[var(--color-border-focus)] bg-[var(--color-surface-strong)] p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm font-semibold text-[var(--color-ink)]">Iter {editingIter} 手动调整</span>
            <input type="date" value={editStart} onChange={e => setEditStart(e.target.value)}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 font-mono text-xs outline-none w-36" />
            <span className="font-mono text-xs text-[var(--color-ink-faint)]">~</span>
            <input type="date" value={editEnd} onChange={e => setEditEnd(e.target.value)}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 font-mono text-xs outline-none w-36" />
            <button onClick={saveEdit} className="rounded-md bg-[var(--color-solid)] px-3 py-1.5 font-mono text-xs text-[var(--color-solid-text)]">保存</button>
            <button onClick={cancelEdit} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 font-mono text-xs text-[var(--color-ink-muted)]">取消</button>
            {filteredIterations.find(i => i.iteration_number === editingIter)?.is_overridden && (
              <button onClick={() => { removeOverrideLocal(editingIter); cancelEdit() }}
                className="rounded-md border border-[var(--color-danger-border)] px-3 py-1.5 font-mono text-xs text-[var(--color-danger-text)]">还原</button>
            )}
          </div>
        </div>
      )}

      {/* Tooltip */}
      {tooltip && (
        <div className="fixed z-50 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-strong)] px-3 py-2 shadow-lg pointer-events-none"
          style={{ left: tooltip.x, top: tooltip.y, transform: 'translate(-50%, -100%)' }}>
          <p className="whitespace-nowrap font-mono text-xs text-[var(--color-ink)]">{formatDateFull(tooltip.date)}</p>
          <p className="whitespace-nowrap font-mono text-[10px] text-[var(--color-ink-muted)]">{tooltip.isWeekend ? '休息日' : '工作日'}</p>
        </div>
      )}

      {/* Popover */}
      {popover && (
        <div ref={popoverRef} className="fixed z-50 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-strong)] px-4 py-3 shadow-xl"
          style={{ left: popover.x, top: popover.y + 4, transform: 'translateX(-50%)' }}>
          <p className="whitespace-nowrap font-mono text-sm font-semibold text-[var(--color-ink)]">{formatDateFull(popover.date)}</p>
          <div className="mt-1 space-y-0.5">
            <p className="whitespace-nowrap font-mono text-xs text-[var(--color-ink-secondary)]">
              Iter {popover.iteration.iteration_number}{popover.date === popover.iteration.start_date && ' · 起始日'}{popover.date === popover.iteration.end_date && ' · 结束日'}
            </p>
            <p className="whitespace-nowrap font-mono text-[10px] text-[var(--color-ink-muted)]">
              {isWeekend(popover.date) ? '休息日' : '工作日'} · 第{Math.round((new Date(popover.date + 'T00:00:00').getTime() - new Date(popover.iteration.start_date + 'T00:00:00').getTime()) / 86400000) + 1}天
            </p>
          </div>
          <div className="mt-3 flex items-center gap-2 border-t border-[var(--color-border)] pt-3">
            <button onClick={() => { setEditingIter(popover.iteration.iteration_number); setEditStart(popover.date); setEditEnd(popover.iteration.end_date); setShowEditPanel(true); setPopover(null) }}
              className="rounded-md bg-[var(--color-solid)] px-3 py-1.5 font-mono text-[10px] text-[var(--color-solid-text)]">设此日为起始</button>
            <button onClick={() => { setEditingIter(popover.iteration.iteration_number); setEditStart(popover.iteration.start_date); setEditEnd(popover.date); setShowEditPanel(true); setPopover(null) }}
              className="rounded-md border border-[var(--color-border)] px-3 py-1.5 font-mono text-[10px] text-[var(--color-ink-muted)]">设此日为结束</button>
            {popover.iteration.is_overridden && (
              <button onClick={() => { removeOverrideLocal(popover.iteration.iteration_number); setPopover(null) }}
                className="rounded-md border border-[var(--color-danger-border)] px-3 py-1.5 font-mono text-[10px] text-[var(--color-danger-text)]">还原</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
