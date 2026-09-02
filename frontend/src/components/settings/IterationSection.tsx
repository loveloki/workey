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
import { useI18n } from '../../lib/i18n'

const VIEW_SIZE = 10

export function IterationSection() {
  const { t } = useI18n()
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
      toastError(t('iteration.error.invalidStartDate'))
      return
    }
    if (!Number.isInteger(days) || days < 1 || days > 100) {
      toastError(t('iteration.error.invalidWorkdays'))
      return
    }
    try {
      await saveSettings.mutateAsync({ iteration_start_date: startDate, iteration_workdays: String(days) })
      toastSuccess(t('iteration.toast.baseSaved'))
    } catch (error) {
      toastError(error instanceof Error ? error.message : t('common.saveFailed'))
    }
  }

  const startEdit = (iteration: IterationRange) => {
    setEditingIter(iteration.iteration_number)
    setEditStart(iteration.start_date)
    setEditEnd(iteration.end_date)
  }

  const saveEdit = async () => {
    if (editingIter === null || !editStart || !editEnd || editStart > editEnd) {
      toastError(t('iteration.error.invalidRange'))
      return
    }
    try {
      await saveOverride.mutateAsync({ iterationNumber: editingIter, startDate: editStart, endDate: editEnd })
      setEditingIter(null)
      toastSuccess(t('iteration.toast.overrideSaved', { number: editingIter }))
    } catch (error) {
      toastError(error instanceof Error ? error.message : t('common.saveFailed'))
    }
  }

  const removeOverride = async (number: number) => {
    try {
      await deleteOverride.mutateAsync(number)
      toastSuccess(t('iteration.toast.overrideRemoved', { number }))
    } catch (error) {
      toastError(error instanceof Error ? error.message : t('iteration.error.restoreFailed'))
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
      toastError(error instanceof Error ? error.message : t('iteration.error.parseCalendar'))
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
      toastSuccess(t('iteration.toast.imported', { count: result.imported_count }))
      setParsedDays([])
      setCalendarFileName('')
    } catch (error) {
      toastError(error instanceof Error ? error.message : t('iteration.error.importFailed'))
    }
  }

  const removeCalendarYear = async (year: number) => {
    try {
      await deleteCalendarYear.mutateAsync(year)
      toastSuccess(t('iteration.toast.calendarYearDeleted', { year }))
    } catch (error) {
      toastError(error instanceof Error ? error.message : t('common.deleteFailed'))
    }
  }

  return (
    <>
      <Card title={t('iteration.rules.title')}>
        <p className="mb-4 font-serif text-sm text-[var(--color-ink-muted)]">
          {t('iteration.rules.desc')}
        </p>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <label className="min-w-[96px] whitespace-nowrap font-mono text-xs text-[var(--color-ink-muted)]">{t('iteration.rules.startDate')}</label>
            <input type="date" value={startDate} onChange={event => setStartDate(event.target.value)} className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-strong)] px-3 py-2 font-mono text-sm outline-none sm:w-auto" />
          </div>
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <label className="min-w-[96px] whitespace-nowrap font-mono text-xs text-[var(--color-ink-muted)]">{t('iteration.rules.workdays')}</label>
            <input type="number" min="1" max="100" value={workdays} onChange={event => setWorkdays(event.target.value)} className="w-24 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-strong)] px-3 py-2 font-mono text-sm outline-none" />
            <span className="font-mono text-xs text-[var(--color-ink-faint)]">{t('iteration.rules.workdaysHint')}</span>
          </div>
          <div>
            <button onClick={saveBase} disabled={saveSettings.isPending} className="rounded-md bg-[var(--color-solid)] px-5 py-2 font-mono text-sm text-[var(--color-solid-text)] disabled:opacity-50">
              {saveSettings.isPending ? t('iteration.saving') : t('iteration.rules.save')}
            </button>
          </div>
        </div>
      </Card>

      <Card title={t('iteration.calendar.title')}>
        <p className="mb-4 font-serif text-sm text-[var(--color-ink-muted)]">
          {t('iteration.calendar.desc')}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="cursor-pointer rounded-md border border-[var(--color-border)] px-3 py-2 font-mono text-xs text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)]">
            {t('iteration.calendar.chooseFile')}
            <input type="file" accept=".json,.csv,application/json,text/csv" onChange={onCalendarFile} className="hidden" />
          </label>
          <button onClick={downloadHolidayCalendarTemplate} className="rounded-md border border-[var(--color-border)] px-3 py-2 font-mono text-xs text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)]">{t('iteration.calendar.downloadTemplate')}</button>
          {parsedDays.length > 0 && (
            <span className="font-mono text-xs text-[var(--color-ink-secondary)]">
              {t('iteration.calendar.parsedSummary', {
                file: calendarFileName,
                count: parsedDays.length,
                years: [...new Set(parsedDays.map(day => day.date.slice(0, 4)))].join('、'),
              })}
            </span>
          )}
        </div>
        {parsedDays.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
            <label className="flex items-center gap-2 font-mono text-xs text-[var(--color-ink-muted)]">
              <input type="checkbox" checked={replaceYears} onChange={event => setReplaceYears(event.target.checked)} />
              {t('iteration.calendar.replaceYears')}
            </label>
            <button onClick={importParsedCalendar} disabled={importCalendar.isPending} className="ml-auto rounded-md bg-[var(--color-solid)] px-4 py-1.5 font-mono text-xs text-[var(--color-solid-text)] disabled:opacity-50">
              {importCalendar.isPending ? t('iteration.calendar.importing') : t('iteration.calendar.confirmImport')}
            </button>
          </div>
        )}
        <div className="mt-4 space-y-1.5">
          {calendarData?.years.length ? calendarData.years.map(year => (
            <div key={year.year} className="flex flex-wrap items-center gap-2 rounded-md px-3 py-2 hover:bg-[var(--color-surface-hover)]">
              <span className="font-mono text-sm font-semibold">{year.year}</span>
              <span className="font-mono text-xs text-[var(--color-ink-muted)]">{t('iteration.calendar.yearSummary', { holidays: year.holiday_count, workdays: year.workday_count })}</span>
              <button onClick={() => removeCalendarYear(year.year)} disabled={deleteCalendarYear.isPending} className="ml-auto rounded-md border border-[var(--color-danger-border)] px-2.5 py-1 font-mono text-xs text-[var(--color-danger-text)] disabled:opacity-50">{t('iteration.calendar.deleteYear')}</button>
            </div>
          )) : (
            <p className="font-mono text-xs text-[var(--color-ink-faint)]">{t('iteration.calendar.emptyHint')}</p>
          )}
        </div>
      </Card>

      <Card title={t('iteration.timeline.title')}>
        <p className="mb-4 font-serif text-sm text-[var(--color-ink-muted)]">
          {t('iteration.timeline.desc')}
        </p>
        {iterationData && (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <button onClick={() => setViewCenter(Math.max(1, safeCenter - VIEW_SIZE))} className="rounded-md border border-[var(--color-border)] px-2.5 py-1.5 font-mono text-xs text-[var(--color-ink-muted)]">{t('iteration.timeline.earlier')}</button>
              <span className="font-mono text-xs text-[var(--color-ink-muted)]">Iter {timeline[0]?.iteration_number} – {timeline.at(-1)?.iteration_number}</span>
              <button onClick={() => setViewCenter(Math.min(maxNumber, safeCenter + VIEW_SIZE))} className="rounded-md border border-[var(--color-border)] px-2.5 py-1.5 font-mono text-xs text-[var(--color-ink-muted)]">{t('iteration.timeline.later')}</button>
              <button onClick={() => setViewCenter(currentNumber)} className="ml-auto rounded-md border border-[var(--color-border)] px-2.5 py-1.5 font-mono text-xs text-[var(--color-ink-muted)]">{t('iteration.timeline.backToCurrent')}</button>
            </div>
            <div className="space-y-1">
              {timeline.map(iteration => editingIter === iteration.iteration_number ? (
                <div key={iteration.iteration_number} className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--color-border-focus)] bg-[var(--color-surface-selected)] p-2.5">
                  <span className="min-w-16 font-mono text-sm font-semibold">Iter {iteration.iteration_number}</span>
                  <input type="date" value={editStart} onChange={event => setEditStart(event.target.value)} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 font-mono text-xs" />
                  <span className="font-mono text-xs text-[var(--color-ink-faint)]">{t('iteration.timeline.to')}</span>
                  <input type="date" value={editEnd} onChange={event => setEditEnd(event.target.value)} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 font-mono text-xs" />
                  <div className="ml-auto flex gap-1.5">
                    <button onClick={saveEdit} className="rounded-md bg-[var(--color-solid)] px-3 py-1 font-mono text-xs text-[var(--color-solid-text)]">{t('common.save')}</button>
                    <button onClick={() => setEditingIter(null)} className="rounded-md border border-[var(--color-border)] px-3 py-1 font-mono text-xs text-[var(--color-ink-muted)]">{t('common.cancel')}</button>
                  </div>
                </div>
              ) : (
                <div key={iteration.iteration_number} className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md px-3 py-2 hover:bg-[var(--color-surface-hover)] ${iteration.iteration_number === currentNumber ? 'border border-[var(--color-border-strong)] bg-[var(--color-surface)]' : ''}`}>
                  <span className="min-w-16 font-mono text-sm font-semibold">Iter {iteration.iteration_number}</span>
                  <span className="font-mono text-xs text-[var(--color-ink-secondary)]">{iteration.start_date} ~ {iteration.end_date}</span>
                  <span className="font-mono text-xs text-[var(--color-ink-faint)]">{t('iteration.timeline.dayStats', { workdays: iteration.workdays, calendarDays: iteration.calendar_days })}</span>
                  {iteration.iteration_number === currentNumber && <span className="rounded bg-[var(--color-solid)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-solid-text)]">{t('iteration.timeline.current')}</span>}
                  {iteration.is_overridden && <span className="rounded bg-[var(--color-success-bg)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-success-text)]">{t('iteration.timeline.overridden')}</span>}
                  <div className="ml-auto flex gap-1">
                    <button onClick={() => startEdit(iteration)} className="rounded-md border border-[var(--color-border)] px-2.5 py-1 font-mono text-xs text-[var(--color-ink-muted)]">{t('iteration.timeline.adjust')}</button>
                    {iteration.is_overridden && <button onClick={() => removeOverride(iteration.iteration_number)} className="rounded-md border border-[var(--color-danger-border)] px-2.5 py-1 font-mono text-xs text-[var(--color-danger-text)]">{t('iteration.timeline.restore')}</button>}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      {overrides.length > 0 && (
        <Card title={t('iteration.overrides.title')}>
          <div className="space-y-1.5">
            {overrides.map(override => (
              <div key={override.iteration_number} className="flex flex-wrap items-center gap-2 py-1 font-mono text-xs">
                <span className="font-semibold">Iter {override.iteration_number}</span>
                <span className="text-[var(--color-ink-secondary)]">{override.start_date} ~ {override.end_date}</span>
                <button onClick={() => setViewCenter(override.iteration_number)} className="ml-auto rounded-md border border-[var(--color-border)] px-2 py-0.5 text-[var(--color-ink-muted)]">{t('iteration.overrides.view')}</button>
                <button onClick={() => removeOverride(override.iteration_number)} className="rounded-md border border-[var(--color-danger-border)] px-2 py-0.5 text-[var(--color-danger-text)]">{t('iteration.timeline.restore')}</button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  )
}
