import { useState, useRef, type ChangeEvent } from 'react'
import JSZip from 'jszip'
import { settings } from '../../lib/api'
import { Card } from '../../components/Card'
import { useToast } from '../../lib/toast-context'
import { useQueryClient } from '@tanstack/react-query'
import { formatDateDisplay, formatTime } from '../../lib/date-utils'
import { useI18n } from '../../lib/i18n'

interface AttendancePreview {
  date: string
  clock_in: string | null
  clock_out: string | null
  status: string
  is_overtime: boolean
}

interface WorkLogPreview {
  date: string
  content: string
}

interface PreviewData {
  attendance: AttendancePreview[]
  work_logs: WorkLogPreview[]
  file: File
}

export function DataSection() {
  const { t } = useI18n()
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [msg, setMsg] = useState('')
  const [isError, setIsError] = useState(false)
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [previewMonth, setPreviewMonth] = useState('all')
  const fileRef = useRef<HTMLInputElement>(null)
  const { toastSuccess, toastError } = useToast()
  const qc = useQueryClient()

  const handleExport = async () => {
    setExporting(true)
    setMsg('')
    try {
      const blob = await settings.exportData()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `workey-export-${new Date().toISOString().split('T')[0]}.zip`
      a.click()
      URL.revokeObjectURL(url)
      setMsg(t('data.export.success'))
      setIsError(false)
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : t('data.export.failed'))
      setIsError(true)
    } finally {
      setExporting(false)
    }
  }

  const handleImport = () => {
    fileRef.current?.click()
  }

  const onFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setMsg('')
    try {
      const zip = await JSZip.loadAsync(file)
      const dataJson = zip.file('data.json')
      if (!dataJson) {
        setMsg(t('data.import.noDataJson'))
        setIsError(true)
        return
      }
      const jsonStr = await dataJson.async('string')
      const parsed = JSON.parse(jsonStr)
      setPreview({
        attendance: parsed.attendance || [],
        work_logs: parsed.work_logs || [],
        file,
      })
      setPreviewMonth('all')
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : t('data.import.parseFailed'))
      setIsError(true)
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const confirmImport = async () => {
    if (!preview) return
    setImporting(true)
    setMsg('')
    try {
      const result = await settings.importData(preview.file)
      const parts = []
      if (result.attendance_count) parts.push(t('data.import.attendanceItems', { count: result.attendance_count }))
      if (result.work_log_count) parts.push(t('data.import.workLogItems', { count: result.work_log_count }))
      if (result.ticket_issue_count) parts.push(t('data.import.ticketIssueItems', { count: result.ticket_issue_count }))
      const summary = parts.join(t('data.import.separator')) || t('data.import.noNewData')
      setMsg(t('data.import.success', { summary }))
      setIsError(false)
      setPreview(null)
      // 导入会引入考勤/工作日志等多类数据，平推刷新所有缓存
      qc.invalidateQueries()
      toastSuccess(t('data.import.success', { summary }))
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : t('data.import.failed')
      setMsg(errMsg)
      setIsError(true)
      toastError(errMsg)
    } finally {
      setImporting(false)
    }
  }

  return (
    <>
      <Card title={t('data.title')}>
        <p className="text-sm mb-4 font-serif text-[var(--color-ink-muted)]">
          {t('data.description')}
        </p>
        <div className="flex flex-col sm:flex-row items-start gap-3">
          <button
            onClick={handleExport}
            disabled={exporting}
            className="font-mono text-sm px-5 py-2 rounded-md text-[var(--color-solid-text)] transition-colors disabled:opacity-50 bg-[var(--color-solid)]"
          >
            {exporting ? t('data.export.exporting') : t('data.export.button')}
          </button>
          <button
            onClick={handleImport}
            disabled={importing}
            className="font-mono text-sm px-5 py-2 rounded-md bg-[var(--color-surface-strong)] transition-colors hover:bg-[var(--color-surface-hover)] disabled:opacity-50 border border-[var(--color-border)]"
          >
            {importing ? t('data.import.importing') : t('data.import.button')}
          </button>
          <input ref={fileRef} type="file" accept=".zip" onChange={onFileChange} className="hidden" />
        </div>
        {msg && (
          <p
            className={`font-mono text-sm mt-3 ${isError ? 'text-[var(--color-danger-text)]' : 'text-[var(--color-ink-muted)]'}`}
          >
            {msg}
          </p>
        )}
      </Card>

      {/* 导入预览弹窗 */}
      {preview && (
        <ImportPreviewModal
          data={preview}
          month={previewMonth}
          onMonthChange={setPreviewMonth}
          onConfirm={confirmImport}
          onCancel={() => setPreview(null)}
          importing={importing}
        />
      )}
    </>
  )
}

function ImportPreviewModal({
  data,
  month,
  onMonthChange,
  onConfirm,
  onCancel,
  importing,
}: {
  data: PreviewData
  month: string
  onMonthChange: (m: string) => void
  onConfirm: () => void
  onCancel: () => void
  importing: boolean
}) {
  const { t } = useI18n()
  // 按日期合并
  const dateMap = new Map<string, { att?: AttendancePreview; log?: WorkLogPreview }>()
  data.attendance.forEach(a => {
    const e = dateMap.get(a.date) || {}
    e.att = a
    dateMap.set(a.date, e)
  })
  data.work_logs.forEach(w => {
    const e = dateMap.get(w.date) || {}
    e.log = w
    dateMap.set(w.date, e)
  })

  const months = [...new Set([...dateMap.keys()].map(d => d.slice(0, 7)))].sort().reverse()

  const filteredDates = [...dateMap.keys()]
    .filter(d => month === 'all' || d.startsWith(month))
    .sort()
    .reverse()

  const withTime = data.attendance.filter(a => a.clock_in).length
  const overtimeCount = data.attendance.filter(a => a.is_overtime).length

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/40 pt-[5vh] overflow-y-auto"
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="w-full max-w-3xl mx-4 mb-8 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] shadow-2xl">
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
          <div>
            <h2 className="font-serif text-xl text-[var(--color-ink)]">{t('data.import.previewTitle')}</h2>
            <p className="mt-1 font-mono text-xs text-[var(--color-ink-muted)]">
              {t('data.import.previewHint')}
            </p>
          </div>
          <button
            onClick={onCancel}
            className="rounded-md p-1.5 text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-surface-hover)]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* 统计 */}
        <div className="grid grid-cols-2 gap-3 px-6 pt-4 sm:grid-cols-4">
          <MiniStat label={t('data.import.statTotalDays')} value={dateMap.size} />
          <MiniStat label={t('data.import.statAttendance')} value={data.attendance.length} sub={t('data.import.withTime', { count: withTime })} />
          <MiniStat label={t('data.import.statWorkLogs')} value={data.work_logs.length} />
          <MiniStat label={t('data.import.statOvertime')} value={overtimeCount} />
        </div>

        {/* 月份筛选 */}
        <div className="flex flex-wrap gap-1.5 px-6 pt-3 pb-1 overflow-x-auto">
          <FilterBtn active={month === 'all'} onClick={() => onMonthChange('all')}>
            {t('data.import.filterAll', { count: dateMap.size })}
          </FilterBtn>
          {months.map(m => {
            const count = [...dateMap.keys()].filter(d => d.startsWith(m)).length
            return (
              <FilterBtn key={m} active={month === m} onClick={() => onMonthChange(m)}>
                {m} ({count})
              </FilterBtn>
            )
          })}
        </div>

        {/* 数据列表 */}
        <div className="max-h-[50vh] overflow-y-auto px-6 py-3 space-y-2">
          {filteredDates.map(date => {
            const entry = dateMap.get(date)!
            return (
              <div key={date} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-[var(--color-ink)]">
                      {formatDateDisplay(date)}
                    </span>
                    <span className="font-mono text-[10px] text-[var(--color-ink-faint)]">{date}</span>
                  </div>
                  <div className="flex items-center gap-3 font-mono text-xs text-[var(--color-ink-muted)]">
                    {entry.att?.is_overtime && (
                      <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-600">{t('data.import.overtimeBadge')}</span>
                    )}
                    {entry.att && (
                      <>
                        <span>{t('data.import.clockIn', { time: formatTime(entry.att.clock_in) })}</span>
                        <span>{t('data.import.clockOut', { time: formatTime(entry.att.clock_out) })}</span>
                      </>
                    )}
                  </div>
                </div>
                {entry.log && (
                  <ul className="mt-2 space-y-0.5 list-disc list-inside">
                    {entry.log.content.split('\n').filter(l => l.trim()).map((line, i) => (
                      <li key={i} className="text-xs font-serif text-[var(--color-ink-secondary)]">
                        {line.replace(/^-\s*/, '')}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>

        {/* 底部操作按钮 */}
        <div className="flex items-center justify-end gap-3 border-t border-[var(--color-border)] px-6 py-4">
          <button
            onClick={onCancel}
            disabled={importing}
            className="rounded-md border border-[var(--color-border)] px-5 py-2 font-mono text-sm text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-surface-hover)] disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={onConfirm}
            disabled={importing}
            className="rounded-md bg-[var(--color-solid)] px-5 py-2 font-mono text-sm text-[var(--color-solid-text)] transition-colors hover:bg-[var(--color-solid-hover)] disabled:opacity-50"
          >
            {importing ? t('data.import.importing') : t('data.import.confirmDays', { count: dateMap.size })}
          </button>
        </div>
      </div>
    </div>
  )
}

function MiniStat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
      <p className="font-mono text-[10px] text-[var(--color-ink-muted)]">{label}</p>
      <p className="font-mono text-lg font-semibold text-[var(--color-ink)]">{value}</p>
      {sub && <p className="font-mono text-[10px] text-[var(--color-ink-faint)]">{sub}</p>}
    </div>
  )
}

function FilterBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-md border px-2.5 py-1 font-mono text-[11px] transition-colors ${
        active
          ? 'border-[var(--color-border-strong)] bg-[var(--color-surface-hover)] font-medium text-[var(--color-ink)]'
          : 'border-[var(--color-border)] bg-[var(--color-surface-strong)] text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)]'
      }`}
    >
      {children}
    </button>
  )
}
