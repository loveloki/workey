import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import type { HolidayCalendarImportDay, IterationRange } from '../../lib/models.gen'
import { Card } from '../Card'
import {
  useDeleteHolidayCalendarYear,
  useDeleteIterationOverride,
  useHolidayCalendar,
  useImportHolidayCalendar,
  useIterationOverrides,
  useIterations,
  useSaveIterationOverride,
  useSaveSettings,
  useSettings,
} from '../../lib/queries'
import { useToast } from '../../lib/toast-context'
import { downloadHolidayCalendarTemplate, parseHolidayCalendar } from '../../lib/holiday-calendar-utils'

const VIEW_SIZE = 10

export function IterationSection() {
  const [startDate, setStartDate] = useState('2019-09-02')
  const [workdays, setWorkdays] = useState('10')
  const [viewCenter, setViewCenter] = useState<number | null>(null)
  const [editingIter, setEditingIter] = useState<number | null>(null)
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')
  const [parsedDays, setParsedDays] = useState<HolidayCalendarImportDay[]>([])
  const [calendarFileName, setCalendarFileName] = useState('')
  const [replaceYears, setReplaceYears] = useState(true)
  const { toastError, toastSuccess } = useToast()

  const { data: settingsData } = useSettings()
  const { data: iterationData } = useIterations()
  const { data: overrideData } = useIterationOverrides()
  const { data: calendarData } = useHolidayCalendar()
  const saveSettings = useSaveSettings()
  const saveOverride = useSaveIterationOverride()
  const deleteOverride = useDeleteIterationOverride()
  const importCalendar = useImportHolidayCalendar()
  const deleteCalendarYear = useDeleteHolidayCalendarYear()

  useEffect(() => {
    if (!settingsData) return
    setStartDate(settingsData.iteration_start_date || '2019-09-02')
    setWorkdays(settingsData.iteration_workdays || '10')
  }, [settingsData])

  useEffect(() => {
    if (iterationData && viewCenter === null) setViewCenter(iterationData.current_iteration)
  }, [iterationData, viewCenter])

  const iterationMap = useMemo(
    () => new Map(iterationData?.iterations.map(item => [item.iteration_number, item]) ?? []),
    [iterationData],
  )
  const currentNumber = iterationData?.current_iteration ?? 1
  const maxNumber = iterationData?.iterations.at(-1)?.iteration_number ?? currentNumber
  const safeCenter = Math.max(1, Math.min(maxNumber, viewCenter ?? currentNumber))
  const fromNumber = Math.max(1, Math.min(maxNumber - VIEW_SIZE + 1, safeCenter - Math.floor(VIEW_SIZE / 2)))
  const timeline = Array.from({ length: VIEW_SIZE }, (_, index) => iterationMap.get(fromNumber + index))
    .filter((item): item is IterationRange => Boolean(item))

  const overrides = overrideData?.overrides ?? []

  const saveBase = async () => {
    const days = Number.parseInt(workdays, 10)
    if (!startDate || Number.isNaN(new Date(`${startDate}T00:00:00`).getTime())) {
      toastError('请输入有效的 Iteration 起始日期')
      return
    }
    if (!Number.isInteger(days) || days < 1 || days > 100) {
      toastError('工作日数需为 1–100 的整数')
      return
    }
    try {
      await saveSettings.mutateAsync({ iteration_start_date: startDate, iteration_workdays: String(days) })
      toastSuccess('Iteration 基础配置已保存')
    } catch (error) {
      toastError(error instanceof Error ? error.message : '保存失败')
    }
  }

  const startEdit = (iteration: IterationRange) => {
    setEditingIter(iteration.iteration_number)
    setEditStart(iteration.start_date)
    setEditEnd(iteration.end_date)
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

  const removeOverride = async (number: number) => {
    try {
      await deleteOverride.mutateAsync(number)
      toastSuccess(`Iter ${number} 已恢复自动计算`)
    } catch (error) {
      toastError(error instanceof Error ? error.message : '恢复失败')
    }
  }

  const onCalendarFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const days = parseHolidayCalendar(await file.text(), file.name)
      setParsedDays(days)
      setCalendarFileName(file.name)
    } catch (error) {
      setParsedDays([])
      setCalendarFileName('')
      toastError(error instanceof Error ? error.message : '无法解析日历文件')
    }
  }

  const importParsedCalendar = async () => {
    if (parsedDays.length === 0) return
    try {
      const result = await importCalendar.mutateAsync({
        days: parsedDays,
        replace_years: replaceYears,
        source: calendarFileName,
      })
      toastSuccess(`已导入 ${result.imported_count} 个节假日例外日期`)
      setParsedDays([])
      setCalendarFileName('')
    } catch (error) {
      toastError(error instanceof Error ? error.message : '导入失败')
    }
  }

  const removeCalendarYear = async (year: number) => {
    try {
      await deleteCalendarYear.mutateAsync(year)
      toastSuccess(`${year} 年节假日日历已删除`)
    } catch (error) {
      toastError(error instanceof Error ? error.message : '删除失败')
    }
  }

  return (
    <>
      <Card title="Iteration 计算规则">
        <p className="mb-4 font-serif text-sm text-[var(--color-ink-muted)]">
          从给定日期开始，每个 Iteration 包含固定数量的工作日。周一至周五默认计为工作日，导入的法定节假日和调休上班日会覆盖默认规则。
        </p>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <label className="min-w-[96px] whitespace-nowrap font-mono text-xs text-[var(--color-ink-muted)]">首个起始日期</label>
            <input type="date" value={startDate} onChange={event => setStartDate(event.target.value)} className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-strong)] px-3 py-2 font-mono text-sm outline-none sm:w-auto" />
          </div>
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <label className="min-w-[96px] whitespace-nowrap font-mono text-xs text-[var(--color-ink-muted)]">每期工作日</label>
            <input type="number" min="1" max="100" value={workdays} onChange={event => setWorkdays(event.target.value)} className="w-24 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-strong)] px-3 py-2 font-mono text-sm outline-none" />
            <span className="font-mono text-xs text-[var(--color-ink-faint)]">默认 10 个工作日约等于两周</span>
          </div>
          <div>
            <button onClick={saveBase} disabled={saveSettings.isPending} className="rounded-md bg-[var(--color-solid)] px-5 py-2 font-mono text-sm text-[var(--color-solid-text)] disabled:opacity-50">
              {saveSettings.isPending ? '保存中…' : '保存计算规则'}
            </button>
          </div>
        </div>
      </Card>

      <Card title="中国节假日日历">
        <p className="mb-4 font-serif text-sm text-[var(--color-ink-muted)]">
          支持 holiday-cn JSON（days + isOffDay）和 CSV。日历只需包含法定休息日与周末调休上班日；重复导入同一年可整年替换，便于每年维护。
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="cursor-pointer rounded-md border border-[var(--color-border)] px-3 py-2 font-mono text-xs text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)]">
            选择 JSON / CSV
            <input type="file" accept=".json,.csv,application/json,text/csv" onChange={onCalendarFile} className="hidden" />
          </label>
          <button onClick={downloadHolidayCalendarTemplate} className="rounded-md border border-[var(--color-border)] px-3 py-2 font-mono text-xs text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)]">下载 CSV 模板</button>
          {parsedDays.length > 0 && (
            <span className="font-mono text-xs text-[var(--color-ink-secondary)]">
              {calendarFileName} · {parsedDays.length} 天 · {[...new Set(parsedDays.map(day => day.date.slice(0, 4)))].join('、')} 年
            </span>
          )}
        </div>
        {parsedDays.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
            <label className="flex items-center gap-2 font-mono text-xs text-[var(--color-ink-muted)]">
              <input type="checkbox" checked={replaceYears} onChange={event => setReplaceYears(event.target.checked)} />
              导入前替换文件涉及年份的旧数据
            </label>
            <button onClick={importParsedCalendar} disabled={importCalendar.isPending} className="ml-auto rounded-md bg-[var(--color-solid)] px-4 py-1.5 font-mono text-xs text-[var(--color-solid-text)] disabled:opacity-50">
              {importCalendar.isPending ? '导入中…' : '确认导入'}
            </button>
          </div>
        )}
        <div className="mt-4 space-y-1.5">
          {calendarData?.years.length ? calendarData.years.map(year => (
            <div key={year.year} className="flex flex-wrap items-center gap-2 rounded-md px-3 py-2 hover:bg-[var(--color-surface-hover)]">
              <span className="font-mono text-sm font-semibold">{year.year}</span>
              <span className="font-mono text-xs text-[var(--color-ink-muted)]">{year.holiday_count} 个休息日例外 · {year.workday_count} 个调休工作日</span>
              <button onClick={() => removeCalendarYear(year.year)} disabled={deleteCalendarYear.isPending} className="ml-auto rounded-md border border-[var(--color-danger-border)] px-2.5 py-1 font-mono text-xs text-[var(--color-danger-text)] disabled:opacity-50">删除该年</button>
            </div>
          )) : (
            <p className="font-mono text-xs text-[var(--color-ink-faint)]">尚未导入节假日日历，将按普通周一至周五计算。</p>
          )}
        </div>
      </Card>

      <Card title="Iteration 时间线">
        <p className="mb-4 font-serif text-sm text-[var(--color-ink-muted)]">
          日期由工作日日历自动计算。特殊情况可手动覆写某一期的起止日期，之后的 Iteration 从覆写结束日次日继续计算。
        </p>
        {iterationData && (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <button onClick={() => setViewCenter(Math.max(1, safeCenter - VIEW_SIZE))} className="rounded-md border border-[var(--color-border)] px-2.5 py-1.5 font-mono text-xs text-[var(--color-ink-muted)]">« 更早</button>
              <span className="font-mono text-xs text-[var(--color-ink-muted)]">Iter {timeline[0]?.iteration_number} – {timeline.at(-1)?.iteration_number}</span>
              <button onClick={() => setViewCenter(Math.min(maxNumber, safeCenter + VIEW_SIZE))} className="rounded-md border border-[var(--color-border)] px-2.5 py-1.5 font-mono text-xs text-[var(--color-ink-muted)]">更晚 »</button>
              <button onClick={() => setViewCenter(currentNumber)} className="ml-auto rounded-md border border-[var(--color-border)] px-2.5 py-1.5 font-mono text-xs text-[var(--color-ink-muted)]">回到当前</button>
            </div>
            <div className="space-y-1">
              {timeline.map(iteration => editingIter === iteration.iteration_number ? (
                <div key={iteration.iteration_number} className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--color-border-focus)] bg-[var(--color-surface-selected)] p-2.5">
                  <span className="min-w-16 font-mono text-sm font-semibold">Iter {iteration.iteration_number}</span>
                  <input type="date" value={editStart} onChange={event => setEditStart(event.target.value)} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 font-mono text-xs" />
                  <span className="font-mono text-xs text-[var(--color-ink-faint)]">至</span>
                  <input type="date" value={editEnd} onChange={event => setEditEnd(event.target.value)} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 font-mono text-xs" />
                  <div className="ml-auto flex gap-1.5">
                    <button onClick={saveEdit} className="rounded-md bg-[var(--color-solid)] px-3 py-1 font-mono text-xs text-[var(--color-solid-text)]">保存</button>
                    <button onClick={() => setEditingIter(null)} className="rounded-md border border-[var(--color-border)] px-3 py-1 font-mono text-xs text-[var(--color-ink-muted)]">取消</button>
                  </div>
                </div>
              ) : (
                <div key={iteration.iteration_number} className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md px-3 py-2 hover:bg-[var(--color-surface-hover)] ${iteration.iteration_number === currentNumber ? 'border border-[var(--color-border-strong)] bg-[var(--color-surface)]' : ''}`}>
                  <span className="min-w-16 font-mono text-sm font-semibold">Iter {iteration.iteration_number}</span>
                  <span className="font-mono text-xs text-[var(--color-ink-secondary)]">{iteration.start_date} ~ {iteration.end_date}</span>
                  <span className="font-mono text-xs text-[var(--color-ink-faint)]">{iteration.workdays} 工作日 / {iteration.calendar_days} 自然日</span>
                  {iteration.iteration_number === currentNumber && <span className="rounded bg-[var(--color-solid)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-solid-text)]">当前</span>}
                  {iteration.is_overridden && <span className="rounded bg-[var(--color-success-bg)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-success-text)]">手动覆写</span>}
                  <div className="ml-auto flex gap-1">
                    <button onClick={() => startEdit(iteration)} className="rounded-md border border-[var(--color-border)] px-2.5 py-1 font-mono text-xs text-[var(--color-ink-muted)]">调整</button>
                    {iteration.is_overridden && <button onClick={() => removeOverride(iteration.iteration_number)} className="rounded-md border border-[var(--color-danger-border)] px-2.5 py-1 font-mono text-xs text-[var(--color-danger-text)]">还原</button>}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      {overrides.length > 0 && (
        <Card title="已手动覆写">
          <div className="space-y-1.5">
            {overrides.map(override => (
              <div key={override.iteration_number} className="flex flex-wrap items-center gap-2 py-1 font-mono text-xs">
                <span className="font-semibold">Iter {override.iteration_number}</span>
                <span className="text-[var(--color-ink-secondary)]">{override.start_date} ~ {override.end_date}</span>
                <button onClick={() => setViewCenter(override.iteration_number)} className="ml-auto rounded-md border border-[var(--color-border)] px-2 py-0.5 text-[var(--color-ink-muted)]">查看</button>
                <button onClick={() => removeOverride(override.iteration_number)} className="rounded-md border border-[var(--color-danger-border)] px-2 py-0.5 text-[var(--color-danger-text)]">还原</button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  )
}
