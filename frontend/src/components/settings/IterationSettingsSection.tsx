import { useEffect, useState, type ChangeEvent } from 'react'
import type { HolidayCalendarImportDay } from '../../lib/models.gen'
import { Card } from '../Card'
import {
  useDeleteHolidayCalendarYear,
  useHolidayCalendar,
  useImportHolidayCalendar,
  useSaveSettings,
  useSettings,
} from '../../lib/queries'
import { useToast } from '../../lib/toast-context'
import { downloadHolidayCalendarTemplate, parseHolidayCalendar } from '../../lib/holiday-calendar-utils'

export function IterationSettingsSection() {
  const [startDate, setStartDate] = useState('2019-09-02')
  const [workdays, setWorkdays] = useState('10')
  const [parsedDays, setParsedDays] = useState<HolidayCalendarImportDay[]>([])
  const [calendarFileName, setCalendarFileName] = useState('')
  const [replaceYears, setReplaceYears] = useState(true)
  const { toastError, toastSuccess } = useToast()

  const { data: settingsData } = useSettings()
  const { data: calendarData } = useHolidayCalendar()
  const saveSettings = useSaveSettings()
  const importCalendar = useImportHolidayCalendar()
  const deleteCalendarYear = useDeleteHolidayCalendarYear()

  useEffect(() => {
    if (!settingsData) return
    setStartDate(settingsData.iteration_start_date || '2019-09-02')
    setWorkdays(settingsData.iteration_workdays || '10')
  }, [settingsData])

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
    </>
  )
}
