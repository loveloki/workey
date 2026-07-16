import { useState, useMemo, useRef, useEffect } from 'react'
import type { IterationRange } from '../../lib/models.gen'
import { useDeleteIterationOverride, useIterations, useSaveIterationOverride } from '../../lib/queries'
import { getToday, formatDateFull } from '../../lib/date-utils'
import { useToast } from '../../lib/toast-context'

const CELL = 12
const ROWS = 15
const MONTH_CELL = 24
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

function isWeekend(dateStr: string): boolean {
  const d = new Date(dateStr + 'T00:00:00')
  const w = d.getDay()
  return w === 0 || w === 6
}

function getMonthName(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.getMonth() + 1}月`
}

function findCellAtPoint(x: number, y: number): { iter: number; col: number; date: string } | null {
  const els = document.elementsFromPoint(x, y)
  for (const el of els) {
    const cellEl = (el as HTMLElement).closest('[data-cell-iter]')
    if (cellEl) {
      return {
        iter: Number(cellEl.getAttribute('data-cell-iter')),
        col: Number(cellEl.getAttribute('data-cell-col')),
        date: cellEl.getAttribute('data-cell-date') || '',
      }
    }
  }
  return null
}

function getDateStr(year: number, month: number, day: number): string {
  const y = String(year)
  const m = String(month + 1).padStart(2, '0')
  const d = String(day).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function monthStartDow(year: number, month: number): number {
  return new Date(year, month, 1).getDay()
}

function MiniMonthCalendar({
  year,
  month,
  onDateSelect,
  onClose,
  iterationData,
  currentNumber,
}: {
  year: number
  month: number
  onDateSelect: (date: string) => void
  onClose: () => void
  iterationData: { iterations: IterationRange[]; current_iteration: number } | undefined
  currentNumber: number
}) {
  const today = getToday()
  const days = daysInMonth(year, month)
  const startDow = monthStartDow(year, month)
  const weeks = Math.ceil((days + startDow) / 7)
  const currentIter = iterationData?.iterations.find(i => i.iteration_number === currentNumber)
  const isInCurrentIter = (dateStr: string) => {
    if (!currentIter) return false
    return dateStr >= currentIter.start_date && dateStr <= currentIter.end_date
  }
  const totalCells = weeks * 7
  return (
    <div className="w-[220px] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-3 shadow-xl">
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-sm font-semibold text-[var(--color-ink)]">{year}年{month + 1}月</span>
      </div>
      <div className="grid grid-cols-7 gap-px">
        {WEEKDAYS.map(w => (
          <div key={w} className="text-center font-mono text-[9px] text-[var(--color-ink-faint)] leading-none py-1">{w}</div>
        ))}
        {Array.from({ length: totalCells }).map((_, i) => {
          const dayNum = i - startDow + 1
          if (dayNum < 1 || dayNum > days) return <div key={i} style={{ width: MONTH_CELL, height: MONTH_CELL }} />
          const dateStr = getDateStr(year, month, dayNum)
          const isToday = dateStr === today
          const inCurrent = isInCurrentIter(dateStr)
          return (
            <div
              key={i}
              onClick={() => onDateSelect(dateStr)}
              className={`flex items-center justify-center cursor-pointer rounded-sm text-[11px] font-mono leading-none transition-colors
                ${isToday ? 'ring-1 ring-[var(--color-danger)] font-bold' : ''}
                ${inCurrent ? 'bg-[var(--color-surface)] text-[var(--color-ink)]' : 'text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)]'}
              `}
              style={{ width: MONTH_CELL, height: MONTH_CELL }}
            >
              {dayNum}
            </div>
          )
        })}
      </div>
      <button onClick={onClose} className="mt-2 w-full rounded-md border border-[var(--color-border)] py-1 font-mono text-[10px] text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)]">关闭</button>
    </div>
  )
}

export function IterationCalendar() {
  const today = getToday()
  const { toastError, toastSuccess } = useToast()

  const { data: iterationData } = useIterations()
  const saveOverride = useSaveIterationOverride()
  const deleteOverride = useDeleteIterationOverride()

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
    return all.filter(iter => {
      const year = Number.parseInt(iter.start_date.slice(0, 4), 10)
      return year === yearFilter
    })
  }, [iterationData, yearFilter])

  // 分页
  const currentNumber = iterationData?.current_iteration ?? 1
  const currentIdx = useMemo(() =>
    filteredIterations.findIndex(iter => iter.iteration_number === currentNumber),
    [filteredIterations, currentNumber],
  )

  const [page, setPage] = useState(0)

  useEffect(() => {
    if (currentIdx >= 0) {
      setPage(Math.floor(currentIdx / ROWS))
    } else {
      setPage(0)
    }
  }, [currentIdx])

  const totalPages = Math.ceil(filteredIterations.length / ROWS) || 1
  const safePage = Math.min(page, totalPages - 1)
  const pageItems = filteredIterations.slice(safePage * ROWS, (safePage + 1) * ROWS)

  // 日历网格数据
  const gridData = useMemo(() => {
    let maxDays = 0
    for (const iter of pageItems) {
      if (iter.calendar_days > maxDays) maxDays = iter.calendar_days
    }
    const cols = Math.max(maxDays, 10)
    return pageItems.map(iter => {
      const start = new Date(iter.start_date + 'T00:00:00')
      const days: { date: string; isToday: boolean; dow: number }[] = []
      for (let i = 0; i < iter.calendar_days; i++) {
        const d = new Date(start)
        d.setDate(d.getDate() + i)
        const dateStr = d.toISOString().slice(0, 10)
        days.push({ date: dateStr, isToday: dateStr === today, dow: d.getDay() })
      }
      return { iteration: iter, days, cols }
    })
  }, [pageItems, today])

  // 月份标签（基于第一行日期）
  const monthLabels = useMemo(() => {
    const firstRow = gridData[0]
    if (!firstRow) return []
    const labels: { col: number; name: string; width: number }[] = []
    let currentMonth = ''
    let startCol = 0
    for (let ci = 0; ci < firstRow.cols; ci++) {
      const day = firstRow.days[ci]
      if (!day) continue
      const monthKey = day.date.slice(0, 7)
      if (monthKey !== currentMonth) {
        if (currentMonth !== '') {
          labels.push({ col: startCol, name: getMonthName(firstRow.days[startCol].date), width: ci - startCol })
        }
        currentMonth = monthKey
        startCol = ci
      }
    }
    if (currentMonth !== '' && firstRow.days[startCol]) {
      labels.push({ col: startCol, name: getMonthName(firstRow.days[startCol].date), width: firstRow.cols - startCol })
    }
    return labels
  }, [gridData])

  // 今天在各行的列位置
  const todayPositions = useMemo(() => {
    const map = new Map<number, number>()
    for (const { iteration, days } of gridData) {
      for (let ci = 0; ci < days.length; ci++) {
        if (days[ci].isToday) {
          map.set(iteration.iteration_number, ci)
          break
        }
      }
    }
    return map
  }, [gridData])

  // 覆写编辑状态
  const [editingIter, setEditingIter] = useState<number | null>(null)
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')

  const startEdit = (iteration: IterationRange) => {
    setEditingIter(iteration.iteration_number)
    setEditStart(iteration.start_date)
    setEditEnd(iteration.end_date)
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
      toastSuccess(`Iter ${editingIter} 已手动调整`)
    } catch (error) {
      toastError(error instanceof Error ? error.message : '保存失败')
    }
  }

  const removeOverrideLocal = async (number: number) => {
    try {
      await deleteOverride.mutateAsync(number)
      toastSuccess(`Iter ${number} 已恢复自动计算`)
    } catch (error) {
      toastError(error instanceof Error ? error.message : '恢复失败')
    }
  }

  // 悬浮 tooltip
  const [tooltip, setTooltip] = useState<{ x: number; y: number; date: string; isWeekend: boolean } | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  const handleMouseEnter = (e: React.MouseEvent, date: string) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setTooltip({ x: rect.left, y: rect.top - 8, date, isWeekend: isWeekend(date) })
  }
  const handleMouseLeave = () => setTooltip(null)

  // 点击 popover
  const [popover, setPopover] = useState<{
    x: number
    y: number
    date: string
    iteration: IterationRange
  } | null>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  const handleCellClick = (e: React.MouseEvent, date: string, iteration: IterationRange) => {
    if (hasDraggedRef.current) {
      hasDraggedRef.current = false
      return
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    if (popover && popover.date === date && popover.iteration.iteration_number === iteration.iteration_number) {
      setPopover(null)
      return
    }
    setPopover({ x: rect.left + rect.width / 2, y: rect.top + rect.height, date, iteration })
  }

  // 点击外部关闭 popover
  useEffect(() => {
    if (!popover) return
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopover(null)
      }
    }
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [popover])

  // 行引用（点击标签滚动定位）
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map())

  const handleLabelClick = (iterationNumber: number) => {
    const el = rowRefs.current.get(iterationNumber)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('ring-2', 'ring-[var(--color-border-focus)]')
      setTimeout(() => el.classList.remove('ring-2', 'ring-[var(--color-border-focus)]'), 1500)
    }
  }

  // 当前 iteration 进度
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
  // ═══════════════════════════════════════════════════════════
  // 1. 日期搜索/跳转
  // ═══════════════════════════════════════════════════════════
  const [searchDate, setSearchDate] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  const jumpToDate = (date: string): boolean => {
    for (const iter of filteredIterations) {
      if (date >= iter.start_date && date <= iter.end_date) {
        const idx = filteredIterations.findIndex(i => i.iteration_number === iter.iteration_number)
        setPage(Math.floor(idx / ROWS))
        setTimeout(() => handleLabelClick(iter.iteration_number), 150)
        return true
      }
    }
    return false
  }

  const handleDateSearch = () => {
    if (!searchDate) return
    if (!jumpToDate(searchDate)) toastError('未找到该日期所在的 Iteration')
  }

  // ═══════════════════════════════════════════════════════════
  // 2. 拖拽选择范围 + 3. 拖拽调节边界
  // ═══════════════════════════════════════════════════════════
  const [dragStart, setDragStart] = useState<{ iter: number; col: number } | null>(null)
  const [dragEnd, setDragEnd] = useState<{ iter: number; col: number } | null>(null)
  const [showRangePopover, setShowRangePopover] = useState(false)
  const hasDraggedRef = useRef(false)
  const pointerStartRef = useRef({ x: 0, y: 0 })
  const gridContainerRef = useRef<HTMLDivElement>(null)

  const [resizing, setResizing] = useState<{ side: 'start' | 'end'; iterNum: number } | null>(null)
  const [resizeDate, setResizeDate] = useState<string | null>(null)
  const resizePointerStartRef = useRef({ x: 0, y: 0 })

  const isSelected = (iterNum: number, colIdx: number) => {
    if (!dragStart || !dragEnd || !hasDraggedRef.current) return false
    const minIter = Math.min(dragStart.iter, dragEnd.iter)
    const maxIter = Math.max(dragStart.iter, dragEnd.iter)
    const minCol = Math.min(dragStart.col, dragEnd.col)
    const maxCol = Math.max(dragStart.col, dragEnd.col)
    return iterNum >= minIter && iterNum <= maxIter && colIdx >= minCol && colIdx <= maxCol
  }

  const handleCellPointerDown = (e: React.PointerEvent, iterNum: number, colIdx: number) => {
    if (e.button !== 0) return
    hasDraggedRef.current = false
    pointerStartRef.current = { x: e.clientX, y: e.clientY }
    setDragStart({ iter: iterNum, col: colIdx })
    setDragEnd({ iter: iterNum, col: colIdx })
    setShowRangePopover(false)
    setPopover(null)
  }

  const handleResizePointerDown = (e: React.PointerEvent, side: 'start' | 'end', iterNum: number) => {
    e.stopPropagation()
    e.preventDefault()
    resizePointerStartRef.current = { x: e.clientX, y: e.clientY }
    setResizing({ side, iterNum })
    setResizeDate(null)
    setPopover(null)
  }

  // 全局 pointer 追踪
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (resizing) {
        const cell = findCellAtPoint(e.clientX, e.clientY)
        if (cell && cell.date !== resizeDate) {
          setResizeDate(cell.date)
        }
        return
      }
      if (!dragStart) return
      const dx = Math.abs(e.clientX - pointerStartRef.current.x)
      const dy = Math.abs(e.clientY - pointerStartRef.current.y)
      if (dx > 3 || dy > 3) {
        hasDraggedRef.current = true
        const cell = findCellAtPoint(e.clientX, e.clientY)
        if (cell) {
          setDragEnd({ iter: cell.iter, col: cell.col })
        }
      }
    }
    const handlePointerUp = async (e: PointerEvent) => {
      if (resizing) {
        if (resizeDate) {
          const iter = filteredIterations.find(i => i.iteration_number === resizing.iterNum)
          if (iter) {
            const newStart = resizing.side === 'start' ? resizeDate : iter.start_date
            const newEnd = resizing.side === 'end' ? resizeDate : iter.end_date
            if (newStart <= newEnd) {
              try {
                await saveOverride.mutateAsync({ iterationNumber: resizing.iterNum, startDate: newStart, endDate: newEnd })
                toastSuccess(`Iter ${resizing.iterNum} 已手动调整`)
              } catch (error) {
                toastError(error instanceof Error ? error.message : '保存失败')
              }
            } else {
              toastError('起始日期不能晚于结束日期')
            }
          }
        }
        setResizing(null)
        setResizeDate(null)
        return
      }
      if (hasDraggedRef.current && dragStart && dragEnd) {
        setShowRangePopover(true)
      }
      hasDraggedRef.current = false
    }
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [resizing, dragStart, dragEnd, resizeDate, filteredIterations, saveOverride, toastError, toastSuccess])

  // ═══════════════════════════════════════════════════════════
  // 4. 缩略月历导航
  // ═══════════════════════════════════════════════════════════
  const [showMonthCalendar, setShowMonthCalendar] = useState(false)
  const [calYear, setCalYear] = useState(() => new Date().getFullYear())
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth())
  const monthCalRef = useRef<HTMLDivElement>(null)

  const handleMonthCalendarDate = (date: string) => {
    if (jumpToDate(date)) {
      setShowMonthCalendar(false)
    } else {
      toastError('未找到该日期所在的 Iteration')
    }
  }

  // 点击月历面板外部关闭
  useEffect(() => {
    if (!showMonthCalendar) return
    const handleClickOutside = (e: MouseEvent) => {
      if (monthCalRef.current && !monthCalRef.current.contains(e.target as Node)) {
        setShowMonthCalendar(false)
      }
    }
    const timer = setTimeout(() => document.addEventListener('mousedown', handleClickOutside), 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showMonthCalendar])

  // 范围选择的数据
  const rangeInfo = useMemo(() => {
    if (!showRangePopover || !dragStart || !dragEnd) return null
    const minIter = Math.min(dragStart.iter, dragEnd.iter)
    const maxIter = Math.max(dragStart.iter, dragEnd.iter)
    const minCol = Math.min(dragStart.col, dragEnd.col)
    const maxCol = Math.max(dragStart.col, dragEnd.col)
    const dates: string[] = []
    let firstIterNum = 0
    for (const { iteration, days } of gridData) {
      if (iteration.iteration_number >= minIter && iteration.iteration_number <= maxIter) {
        const start = iteration.iteration_number === minIter ? minCol : 0
        const end = iteration.iteration_number === maxIter ? Math.min(maxCol, days.length - 1) : days.length - 1
        for (let i = start; i <= end; i++) {
          if (days[i]) dates.push(days[i].date)
        }
        if (firstIterNum === 0) firstIterNum = iteration.iteration_number
      }
    }
    return dates.length > 0
      ? { firstDate: dates[0], lastDate: dates[dates.length - 1], count: dates.length, firstIterNum }
      : null
  }, [showRangePopover, dragStart, dragEnd, gridData])

  // 没有数据时的占位
  if (!iterationData || iterationData.iterations.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-8 text-center font-mono text-sm text-[var(--color-ink-muted)]">
        暂无 Iteration 数据
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 主日历视图 */}
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-4">
        {/* 进度条 */}
        {currentIterProgress && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono text-xs text-[var(--color-ink-muted)]">
                Iter {currentNumber} 进度
              </span>
              <span className="font-mono text-xs text-[var(--color-ink-muted)]">
                {currentIterProgress.elapsed} / {currentIterProgress.total} 天 ({currentIterProgress.pct}%)
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-[var(--color-surface)]">
              <div
                className="h-full rounded-full bg-[var(--color-solid)] transition-all duration-500"
                style={{ width: `${currentIterProgress.pct}%` }}
              />
            </div>
          </div>
        )}

        {/* 导航栏 */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button onClick={() => setPage(Math.max(0, safePage - 1))} disabled={safePage === 0}
            className="rounded-md border border-[var(--color-border)] px-2.5 py-1.5 font-mono text-xs text-[var(--color-ink-muted)] disabled:opacity-30">« 更早</button>

          <span className="font-mono text-xs text-[var(--color-ink-muted)]">
            Iter {pageItems[0]?.iteration_number} – {pageItems[pageItems.length - 1]?.iteration_number}
            {totalPages > 1 && <span className="ml-1 text-[var(--color-ink-faint)]">({safePage + 1}/{totalPages})</span>}
          </span>

          <button onClick={() => setPage(Math.min(totalPages - 1, safePage + 1))} disabled={safePage >= totalPages - 1}
            className="rounded-md border border-[var(--color-border)] px-2.5 py-1.5 font-mono text-xs text-[var(--color-ink-muted)] disabled:opacity-30">更晚 »</button>

          <button onClick={() => { if (currentIdx >= 0) setPage(Math.floor(currentIdx / ROWS)) }}
            className="rounded-md border border-[var(--color-border)] px-2.5 py-1.5 font-mono text-xs text-[var(--color-ink-muted)]">回到当前</button>

          <div className="ml-auto flex items-center gap-1.5">
            {/* 日期搜索 */}
            <input
              ref={searchInputRef}
              type="date"
              value={searchDate}
              onChange={e => setSearchDate(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleDateSearch()}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 font-mono text-xs outline-none w-32"
            />
            <button onClick={handleDateSearch}
              className="rounded-md bg-[var(--color-solid)] px-2 py-1 font-mono text-xs text-[var(--color-solid-text)]">跳转</button>

            {/* 月历按钮 */}
            <button onClick={() => { setShowMonthCalendar(!showMonthCalendar); if (!showMonthCalendar) { const d = new Date(); setCalYear(d.getFullYear()); setCalMonth(d.getMonth()) } }}
              className="rounded-md border border-[var(--color-border)] px-2 py-1 font-mono text-xs text-[var(--color-ink-muted)]">📅</button>

            <span className="font-mono text-[10px] text-[var(--color-ink-faint)] ml-1">过滤:</span>
            <select value={yearFilter ?? ''} onChange={e => setYearFilter(e.target.value ? Number(e.target.value) : null)}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 font-mono text-xs outline-none">
              <option value="">全部</option>
              {years.map(y => <option key={y} value={y}>{y}年</option>)}
            </select>
          </div>
        </div>

        {/* 月历面板 */}
        {showMonthCalendar && (
          <div ref={monthCalRef} className="relative mb-4">
            <div className="absolute right-0 z-40">
              <MiniMonthCalendar
                year={calYear}
                month={calMonth}
                onDateSelect={handleMonthCalendarDate}
                onClose={() => setShowMonthCalendar(false)}
                iterationData={iterationData}
                currentNumber={currentNumber}
              />
            </div>
          </div>
        )}
        {/* 日历网格 */}
        <div className="overflow-x-auto" ref={gridContainerRef}>
          <div className="min-w-fit">
            {/* 月份标签行 */}
            {monthLabels.length > 0 && (
              <div className="flex items-center gap-[3px] mb-[2px]" style={{ paddingLeft: '72px' }}>
                {monthLabels.map(label => (
                  <div
                    key={label.col}
                    className="flex-shrink-0 text-center font-mono text-[10px] font-semibold text-[var(--color-ink-secondary)] leading-none"
                    style={{ width: label.width * CELL + (label.width - 1) * 3, paddingTop: '2px' }}
                  >
                    <span className="bg-[var(--color-surface-strong)] px-1 rounded">{label.name}</span>
                  </div>
                ))}
              </div>
            )}

            {/* 星期列头 */}
            <div className="flex items-center gap-[3px] pl-[72px] mb-1">
              {gridData[0]?.days.slice(0, gridData[0]?.cols).map((day, ci) => (
                <div key={ci}
                  style={{ width: CELL }}
                  className={`text-center font-mono text-[9px] leading-none ${
                    day.dow === 0 || day.dow === 6 ? 'text-[var(--color-ink-faint)]' : 'text-[var(--color-ink-muted)]'
                  }`}
                >
                  {WEEKDAYS[day.dow]}
                </div>
              ))}
            </div>

            {/* 网格行 */}
            <div className="space-y-[3px]">
              {gridData.map(({ iteration, days, cols }) => {
                const isCurrent = iteration.iteration_number === currentNumber
                const isEditing = editingIter === iteration.iteration_number
                const todayCol = todayPositions.get(iteration.iteration_number)

                return (
                  <div
                    key={iteration.iteration_number}
                    ref={el => { if (el) rowRefs.current.set(iteration.iteration_number, el) }}
                    className={`group flex items-center gap-2 rounded-md px-2 py-[5px] transition-colors ${
                      isCurrent
                        ? 'bg-[var(--color-surface)] ring-1 ring-[var(--color-border-strong)] shadow-sm'
                        : 'hover:bg-[var(--color-surface-hover)]'
                    }`}
                  >
                    {/* 标签区域（可点击定位） */}
                    <div
                      className="flex w-[64px] shrink-0 items-center gap-1 cursor-pointer"
                      onClick={() => handleLabelClick(iteration.iteration_number)}
                    >
                      <span className={`font-mono text-xs font-semibold ${
                        isCurrent ? 'text-[var(--color-ink)]' : 'text-[var(--color-ink-secondary)]'
                      }`}>
                        Iter {iteration.iteration_number}
                      </span>
                      {isCurrent && (
                        <span className="rounded bg-[var(--color-solid)] px-1 py-[1px] font-mono text-[8px] text-[var(--color-solid-text)] leading-none">当前</span>
                      )}
                      {iteration.is_overridden && (
                        <span className="rounded bg-[var(--color-success-bg)] px-1 py-[1px] font-mono text-[8px] text-[var(--color-success-text)] leading-none">改</span>
                      )}
                    </div>

                    {/* 方格行 */}
                    <div className="flex gap-[3px] relative">
                      {Array.from({ length: cols }).map((_, ci) => {
                        const day = days[ci]
                        if (!day) return <div key={ci} style={{ width: CELL, height: CELL }} />
                        const weekend = day.dow === 0 || day.dow === 6
                        const isTodayCell = ci === todayCol
                        const selected = isSelected(iteration.iteration_number, ci)

                        return (
                          <div key={ci} className="relative">
                            <div
                              data-cell-iter={iteration.iteration_number}
                              data-cell-col={ci}
                              data-cell-date={day.date}
                              onPointerDown={e => handleCellPointerDown(e, iteration.iteration_number, ci)}
                              onMouseEnter={e => handleMouseEnter(e, day.date)}
                              onMouseLeave={handleMouseLeave}
                              onClick={e => handleCellClick(e, day.date, iteration)}
                              style={{
                                width: CELL,
                                height: CELL,
                                backgroundColor: isTodayCell
                                  ? 'var(--color-solid)'
                                  : weekend
                                    ? 'var(--color-border-subtle)'
                                    : 'var(--color-border-strong)',
                                opacity: weekend && !isTodayCell ? 0.4 : 1,
                                borderLeft: isTodayCell ? '2px solid var(--color-danger)' : 'none',
                                borderRadius: isTodayCell ? '1px' : '2px',
                                cursor: 'pointer',
                                transition: 'transform 0.1s, opacity 0.1s',
                              }}
                              className="hover:scale-125"
                              title={`${formatDateFull(day.date)}${weekend ? ' · 休息' : ''}`}
                            />
                            {/* 选择遮罩 */}
                            {selected && (
                              <div
                                className="absolute inset-0 pointer-events-none"
                                style={{
                                  backgroundColor: 'rgba(59, 130, 246, 0.25)',
                                  borderRadius: '2px',
                                  border: '1px solid rgba(59, 130, 246, 0.5)',
                                }}
                              />
                            )}
                            {/* 左边界拖拽手柄 */}
                            {ci === 0 && (
                              <div
                                className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize z-10 opacity-0 group-hover:opacity-100 transition-opacity"
                                onPointerDown={e => handleResizePointerDown(e, 'start', iteration.iteration_number)}
                              >
                                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-px h-4 bg-[var(--color-border-strong)]" />
                              </div>
                            )}
                            {/* 右边界拖拽手柄 */}
                            {ci === cols - 1 && (
                              <div
                                className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize z-10 opacity-0 group-hover:opacity-100 transition-opacity"
                                onPointerDown={e => handleResizePointerDown(e, 'end', iteration.iteration_number)}
                              >
                                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-px h-4 bg-[var(--color-border-strong)]" />
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>

                    {/* 统计 + 操作按钮 */}
                    <div className="ml-auto flex shrink-0 items-center gap-2">
                      <span className="font-mono text-[10px] text-[var(--color-ink-faint)] whitespace-nowrap">
                        {iteration.workdays}/{iteration.calendar_days}d
                      </span>
                      {isEditing ? (
                        <div className="flex items-center gap-1">
                          <input type="date" value={editStart} onChange={e => setEditStart(e.target.value)}
                            className="w-28 rounded border border-[var(--color-border-focus)] bg-[var(--color-surface)] px-1.5 py-0.5 font-mono text-[10px] outline-none" />
                          <span className="font-mono text-[10px] text-[var(--color-ink-faint)]">~</span>
                          <input type="date" value={editEnd} onChange={e => setEditEnd(e.target.value)}
                            className="w-28 rounded border border-[var(--color-border-focus)] bg-[var(--color-surface)] px-1.5 py-0.5 font-mono text-[10px] outline-none" />
                          <button onClick={saveEdit}
                            className="rounded bg-[var(--color-solid)] px-2 py-0.5 font-mono text-[10px] text-[var(--color-solid-text)]">保存</button>
                          <button onClick={() => setEditingIter(null)}
                            className="rounded border border-[var(--color-border)] px-2 py-0.5 font-mono text-[10px] text-[var(--color-ink-muted)]">取消</button>
                        </div>
                      ) : (
                        <>
                          <button onClick={() => startEdit(iteration)}
                            className="rounded-md border border-[var(--color-border)] px-2 py-0.5 font-mono text-[10px] text-[var(--color-ink-muted)] opacity-0 group-hover:opacity-100 transition-opacity">调整</button>
                          {iteration.is_overridden && (
                            <button onClick={() => removeOverrideLocal(iteration.iteration_number)}
                              className="rounded-md border border-[var(--color-danger-border)] px-2 py-0.5 font-mono text-[10px] text-[var(--color-danger-text)]">还原</button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* 图例 */}
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <span className="font-mono text-[10px] text-[var(--color-ink-faint)]">图例:</span>
          <div className="flex items-center gap-1.5">
            <div style={{ width: CELL, height: CELL, backgroundColor: 'var(--color-border-strong)', borderRadius: '2px' }} />
            <span className="font-mono text-[10px] text-[var(--color-ink-muted)]">工作日</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div style={{ width: CELL, height: CELL, backgroundColor: 'var(--color-border-subtle)', opacity: 0.4, borderRadius: '2px' }} />
            <span className="font-mono text-[10px] text-[var(--color-ink-muted)]">非工作日</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div style={{ width: CELL, height: CELL, backgroundColor: 'var(--color-solid)', borderRadius: '1px', borderLeft: '2px solid var(--color-danger)' }} />
            <span className="font-mono text-[10px] text-[var(--color-ink-muted)]">今天</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div style={{ width: 12, height: 12, border: '1px solid var(--color-border-strong)', borderRadius: '2px', backgroundColor: 'var(--color-surface)', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }} />
            <span className="font-mono text-[10px] text-[var(--color-ink-muted)]">当前 Iteration</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div style={{ width: 12, height: 12, backgroundColor: 'rgba(59, 130, 246, 0.25)', borderRadius: '2px', border: '1px solid rgba(59, 130, 246, 0.5)' }} />
            <span className="font-mono text-[10px] text-[var(--color-ink-muted)]">选择范围</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="rounded bg-[var(--color-success-bg)] px-1 py-[1px] font-mono text-[8px] text-[var(--color-success-text)] leading-none">改</span>
            <span className="font-mono text-[10px] text-[var(--color-ink-muted)]">已手动覆写</span>
          </div>
        </div>
      </div>

      {/* 边界拖拽预览 */}
      {resizing && resizeDate && (
        <div className="fixed z-50 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-strong)] px-3 py-2 shadow-lg pointer-events-none"
          style={{ left: '50%', bottom: '20px', transform: 'translateX(-50%)' }}
        >
          <p className="whitespace-nowrap font-mono text-xs text-[var(--color-ink)]">
            {resizing.side === 'start' ? '起始日' : '结束日'}: {formatDateFull(resizeDate)}
          </p>
        </div>
      )}

      {/* 悬浮 Tooltip */}
      {tooltip && (
        <div
          ref={tooltipRef}
          className="fixed z-50 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-strong)] px-3 py-2 shadow-lg pointer-events-none"
          style={{ left: tooltip.x, top: tooltip.y, transform: 'translate(-50%, -100%)' }}
        >
          <p className="whitespace-nowrap font-mono text-xs text-[var(--color-ink)]">
            {formatDateFull(tooltip.date)}
          </p>
          <p className="whitespace-nowrap font-mono text-[10px] text-[var(--color-ink-muted)]">
            {tooltip.isWeekend ? '休息日' : '工作日'}
          </p>
        </div>
      )}

      {/* 点击 Popover */}
      {popover && (
        <div
          ref={popoverRef}
          className="fixed z-50 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-strong)] px-4 py-3 shadow-xl"
          style={{ left: popover.x, top: popover.y + 4, transform: 'translateX(-50%)' }}
        >
          <p className="whitespace-nowrap font-mono text-sm font-semibold text-[var(--color-ink)]">
            {formatDateFull(popover.date)}
          </p>
          <div className="mt-1 space-y-0.5">
            <p className="whitespace-nowrap font-mono text-xs text-[var(--color-ink-secondary)]">
              Iter {popover.iteration.iteration_number}
              {popover.date === popover.iteration.start_date && ' · 起始日'}
              {popover.date === popover.iteration.end_date && ' · 结束日'}
            </p>
            <p className="whitespace-nowrap font-mono text-[10px] text-[var(--color-ink-muted)]">
              {isWeekend(popover.date) ? '休息日' : '工作日'} · 第{Math.round((new Date(popover.date + 'T00:00:00').getTime() - new Date(popover.iteration.start_date + 'T00:00:00').getTime()) / 86400000) + 1}天
            </p>
          </div>
          <div className="mt-3 flex items-center gap-2 border-t border-[var(--color-border)] pt-3">
            <button
              onClick={() => {
                setEditingIter(popover.iteration.iteration_number)
                setEditStart(popover.date)
                setEditEnd(popover.iteration.end_date)
                setPopover(null)
              }}
              className="rounded-md bg-[var(--color-solid)] px-3 py-1.5 font-mono text-[10px] text-[var(--color-solid-text)]"
            >
              设此日为起始
            </button>
            <button
              onClick={() => {
                setEditingIter(popover.iteration.iteration_number)
                setEditStart(popover.iteration.start_date)
                setEditEnd(popover.date)
                setPopover(null)
              }}
              className="rounded-md border border-[var(--color-border)] px-3 py-1.5 font-mono text-[10px] text-[var(--color-ink-muted)]"
            >
              设此日为结束
            </button>
            {popover.iteration.is_overridden && (
              <button
                onClick={() => { removeOverrideLocal(popover.iteration.iteration_number); setPopover(null) }}
                className="rounded-md border border-[var(--color-danger-border)] px-3 py-1.5 font-mono text-[10px] text-[var(--color-danger-text)]"
              >
                还原
              </button>
            )}
          </div>
        </div>
      )}

      {/* 范围选择 Popover */}
      {showRangePopover && rangeInfo && (
        <div className="fixed z-50 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-strong)] px-5 py-4 shadow-xl"
          style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
        >
          <p className="font-mono text-sm font-semibold text-[var(--color-ink)]">选择日期范围</p>
          <p className="mt-1 font-mono text-xs text-[var(--color-ink-secondary)]">
            {rangeInfo.firstDate} ~ {rangeInfo.lastDate}
          </p>
          <p className="font-mono text-[10px] text-[var(--color-ink-muted)]">
            共 {rangeInfo.count} 天
          </p>
          <div className="mt-3 flex gap-2 border-t border-[var(--color-border)] pt-3">
            <button onClick={async () => {
              try {
                const iter = filteredIterations.find(i => i.iteration_number === rangeInfo.firstIterNum)
                if (iter) {
                  await saveOverride.mutateAsync({
                    iterationNumber: iter.iteration_number,
                    startDate: rangeInfo.firstDate,
                    endDate: rangeInfo.lastDate,
                  })
                  toastSuccess(`Iter ${iter.iteration_number} 已手动调整`)
                }
              } catch (error) {
                toastError(error instanceof Error ? error.message : '保存失败')
              }
              setShowRangePopover(false)
              setDragStart(null)
              setDragEnd(null)
            }} className="rounded-md bg-[var(--color-solid)] px-3 py-1.5 font-mono text-xs text-[var(--color-solid-text)]">
              设为覆写起止
            </button>
            <button onClick={() => {
              setShowRangePopover(false)
              setDragStart(null)
              setDragEnd(null)
            }} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 font-mono text-xs text-[var(--color-ink-muted)]">
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
