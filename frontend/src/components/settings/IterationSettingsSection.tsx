import { useEffect, useState, type ChangeEvent } from 'react'
import { Link } from '@tanstack/react-router'
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
import { useI18n } from '../../lib/i18n'

export function IterationSettingsSection() {
  const { t } = useI18n()
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
      toastError(t('settings.iteration.invalidStartDate'))
      return
    }
    if (!Number.isInteger(days) || days < 1 || days > 100) {
      toastError(t('settings.iteration.invalidWorkdays'))
      return
    }
    try {
      await saveSettings.mutateAsync({ iteration_start_date: startDate, iteration_workdays: String(days) })
      toastSuccess(t('settings.iteration.baseSaved'))
    } catch (error) {
      toastError(error instanceof Error ? error.message : t('common.saveFailed'))
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
      toastError(error instanceof Error ? error.message : t('settings.holiday.parseFailed'))
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
      toastSuccess(t('settings.holiday.importSuccess', { count: result.imported_count }))
      setParsedDays([])
      setCalendarFileName('')
    } catch (error) {
      toastError(error instanceof Error ? error.message : t('settings.holiday.importFailed'))
    }
  }

  const removeCalendarYear = async (year: number) => {
    try {
      await deleteCalendarYear.mutateAsync(year)
      toastSuccess(t('settings.holiday.yearDeleted', { year }))
    } catch (error) {
      toastError(error instanceof Error ? error.message : t('common.deleteFailed'))
    }
  }

  return (
    <>
      <Card title={t('settings.iteration.rulesTitle')}>
        <p className="mb-4 font-serif text-sm text-[var(--color-ink-muted)]">
          {t('settings.iteration.rulesDesc')}
        </p>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <label className="min-w-[96px] whitespace-nowrap font-mono text-xs text-[var(--color-ink-muted)]">{t('settings.iteration.startDateLabel')}</label>
            <input type="date" value={startDate} onChange={event => setStartDate(event.target.value)} className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-strong)] px-3 py-2 font-mono text-sm outline-none sm:w-auto" />
          </div>
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <label className="min-w-[96px] whitespace-nowrap font-mono text-xs text-[var(--color-ink-muted)]">{t('settings.iteration.workdaysLabel')}</label>
            <input type="number" min="1" max="100" value={workdays} onChange={event => setWorkdays(event.target.value)} className="w-24 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-strong)] px-3 py-2 font-mono text-sm outline-none" />
            <span className="font-mono text-xs text-[var(--color-ink-faint)]">{t('settings.iteration.workdaysHint')}</span>
          </div>
          <div>
            <button onClick={saveBase} disabled={saveSettings.isPending} className="rounded-md bg-[var(--color-solid)] px-5 py-2 font-mono text-sm text-[var(--color-solid-text)] disabled:opacity-50">
              {saveSettings.isPending ? t('settings.iteration.saving') : t('settings.iteration.saveRules')}
            </button>
          </div>
        </div>
      </Card>

      <Card title={t('settings.holiday.title')}>
        <p className="mb-4 font-serif text-sm text-[var(--color-ink-muted)]">
          {t('settings.holiday.desc')}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="cursor-pointer rounded-md border border-[var(--color-border)] px-3 py-2 font-mono text-xs text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)]">
            {t('settings.holiday.chooseFile')}
            <input type="file" accept=".json,.csv,application/json,text/csv" onChange={onCalendarFile} className="hidden" />
          </label>
          <button onClick={downloadHolidayCalendarTemplate} className="rounded-md border border-[var(--color-border)] px-3 py-2 font-mono text-xs text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)]">{t('settings.holiday.downloadTemplate')}</button>
          {parsedDays.length > 0 && (
            <span className="font-mono text-xs text-[var(--color-ink-secondary)]">
              {t('settings.holiday.fileSummary', {
                name: calendarFileName,
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
              {t('settings.holiday.replaceYears')}
            </label>
            <button onClick={importParsedCalendar} disabled={importCalendar.isPending} className="ml-auto rounded-md bg-[var(--color-solid)] px-4 py-1.5 font-mono text-xs text-[var(--color-solid-text)] disabled:opacity-50">
              {importCalendar.isPending ? t('settings.holiday.importing') : t('settings.holiday.confirmImport')}
            </button>
          </div>
        )}
        <div className="mt-4 space-y-1.5">
          {calendarData?.years.length ? calendarData.years.map(year => (
            <div key={year.year} className="flex flex-wrap items-center gap-2 rounded-md px-3 py-2 hover:bg-[var(--color-surface-hover)]">
              <span className="font-mono text-sm font-semibold">{year.year}</span>
              <span className="font-mono text-xs text-[var(--color-ink-muted)]">{t('settings.holiday.yearSummary', { holidays: year.holiday_count, workdays: year.workday_count })}</span>
              <button onClick={() => removeCalendarYear(year.year)} disabled={deleteCalendarYear.isPending} className="ml-auto rounded-md border border-[var(--color-danger-border)] px-2.5 py-1 font-mono text-xs text-[var(--color-danger-text)] disabled:opacity-50">{t('settings.holiday.deleteYear')}</button>
            </div>
          )) : (
            <p className="font-mono text-xs text-[var(--color-ink-faint)]">{t('settings.holiday.empty')}</p>
          )}
        </div>
      </Card>

      <Card title={t('settings.iteration.timelineTitle')}>
        <p className="mb-4 font-serif text-sm text-[var(--color-ink-muted)]">
          {t('settings.iteration.timelineDesc')}
        </p>
        <Link
          to="/iterations"
          className="inline-block rounded-md bg-[var(--color-solid)] px-5 py-2 font-mono text-sm no-underline text-[var(--color-solid-text)]"
        >
          {t('settings.iteration.manageTimeline')}
        </Link>
      </Card>
    </>
  )
}
