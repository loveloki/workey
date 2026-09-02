import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { LoadingScreen } from '../components/LoadingScreen'
import { PageHeader } from '../components/PageHeader'
import {
  type TicketIssue,
  type TicketIssueFilters,
  type TicketIssueInput,
  type TicketCauseType,
} from '../lib/api'
import { formatDateDisplay, getDateRange, getToday } from '../lib/date-utils'
import {
  useCreateTicketIssue,
  useDeleteTicketIssue,
  useTicketIssueList,
  useTicketIssueStats,
  useUpdateTicketIssue,
} from '../lib/queries'
import { useAuthGuard } from '../lib/useAuthGuard'
import { useToast } from '../lib/toast-context'
import { useI18n } from '../lib/i18n'

export const Route = createFileRoute('/ticket-issues')({ component: TicketIssuesPage })

type DatePreset = 'all' | 'month' | 'quarter' | 'year' | 'custom'

const issueInputClass = 'w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 font-mono text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-border-focus)]'

const emptyIssue = (): TicketIssueInput => ({
  ticket_no: '',
  ticket_title: '',
  ticket_url: '',
  occurred_on: getToday(),
  cause_type: 'code',
  problem_description: '',
  cause_detail: '',
  resolution: '',
})

function TicketIssuesPage() {
  const { t } = useI18n()
  const { user, loading } = useAuthGuard()
  const [preset, setPreset] = useState<DatePreset>('all')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [activeCustom, setActiveCustom] = useState<{ start: string; end: string } | null>(null)
  const [causeType, setCauseType] = useState<TicketCauseType | ''>('')
  const [searchText, setSearchText] = useState('')
  const [keyword, setKeyword] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<TicketIssue | null>(null)

  const dateRange = useMemo(() => {
    if (preset === 'all') return { start: '', end: '' }
    if (preset === 'custom') return activeCustom ?? { start: '', end: '' }
    return getDateRange(preset)
  }, [preset, activeCustom])

  const listFilters = useMemo<TicketIssueFilters>(() => ({
    ...dateRange,
    cause_type: causeType,
    q: keyword,
  }), [dateRange, causeType, keyword])
  const statsFilters = useMemo<TicketIssueFilters>(() => ({
    ...dateRange,
    q: keyword,
  }), [dateRange, keyword])

  const { data: listData, isFetching } = useTicketIssueList(listFilters, !!user)
  const { data: statsData } = useTicketIssueStats(statsFilters, !!user)
  const issues = listData?.ticket_issues ?? []

  if (loading) return <LoadingScreen />
  if (!user) return null

  const startCreate = () => {
    setEditing(null)
    setFormOpen(true)
  }

  const startEdit = (issue: TicketIssue) => {
    setEditing(issue)
    setFormOpen(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <main className="mx-auto max-w-5xl px-4 pb-8 pt-8">
      <PageHeader
        eyebrow={t('ticketIssues.eyebrow')}
        title={t('ticketIssues.title')}
        actions={(
          <button
            onClick={startCreate}
            className="rounded-md bg-[var(--color-solid)] px-4 py-2 font-mono text-sm text-[var(--color-solid-text)] hover:bg-[var(--color-solid-hover)]"
          >
            {t('ticketIssues.add')}
          </button>
        )}
      />

      {formOpen && (
        <TicketIssueForm
          key={editing?.id ?? 'new'}
          issue={editing}
          onClose={() => { setFormOpen(false); setEditing(null) }}
        />
      )}

      <StatsPanel stats={statsData ?? { total_count: 0, code_count: 0, operation_count: 0 }} />

      <section className="mb-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-4">
        <div className="flex flex-wrap gap-2">
          {([
            ['all', 'ticketIssues.filter.all'],
            ['month', 'ticketIssues.filter.month'],
            ['quarter', 'ticketIssues.filter.quarter'],
            ['year', 'ticketIssues.filter.year'],
            ['custom', 'ticketIssues.filter.custom'],
          ] as const).map(([key, labelKey]) => (
            <button
              key={key}
              onClick={() => setPreset(key)}
              className={`rounded-md border px-3 py-1.5 font-mono text-xs ${
                preset === key
                  ? 'border-[var(--color-border-strong)] bg-[var(--color-surface-hover)] text-[var(--color-ink)]'
                  : 'border-[var(--color-border)] text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)]'
              }`}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>

        {preset === 'custom' && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={customStart}
              onChange={event => setCustomStart(event.target.value)}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 font-mono text-sm text-[var(--color-ink)] outline-none"
            />
            <span className="font-serif text-sm text-[var(--color-ink-muted)]">{t('ticketIssues.dateTo')}</span>
            <input
              type="date"
              value={customEnd}
              onChange={event => setCustomEnd(event.target.value)}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 font-mono text-sm text-[var(--color-ink)] outline-none"
            />
            <button
              onClick={() => customStart && customEnd && setActiveCustom({ start: customStart, end: customEnd })}
              disabled={!customStart || !customEnd || customStart > customEnd}
              className="rounded-md bg-[var(--color-solid)] px-4 py-2 font-mono text-xs text-[var(--color-solid-text)] disabled:opacity-50"
            >
              {t('ticketIssues.applyDate')}
            </button>
          </div>
        )}

        <div className="mt-3 grid gap-2 sm:grid-cols-[160px_1fr_auto]">
          <select
            value={causeType}
            onChange={event => setCauseType(event.target.value as TicketCauseType | '')}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 font-mono text-sm text-[var(--color-ink)] outline-none"
          >
            <option value="">{t('ticketIssues.causeAll')}</option>
            <option value="code">{t('ticketIssues.cause.code')}</option>
            <option value="operation">{t('ticketIssues.cause.operation')}</option>
          </select>
          <input
            type="search"
            value={searchText}
            onChange={event => setSearchText(event.target.value)}
            onKeyDown={event => event.key === 'Enter' && setKeyword(searchText.trim())}
            placeholder={t('ticketIssues.searchPlaceholder')}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 font-mono text-sm text-[var(--color-ink)] outline-none"
          />
          <button
            onClick={() => setKeyword(searchText.trim())}
            className="rounded-md border border-[var(--color-border)] px-4 py-2 font-mono text-sm text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)]"
          >
            {t('ticketIssues.search')}
          </button>
        </div>
        <p className="mt-3 font-mono text-xs text-[var(--color-ink-faint)]">
          {t('ticketIssues.filterHint')}
        </p>
      </section>

      {isFetching && issues.length === 0 ? (
        <p className="py-8 text-center font-mono text-sm text-[var(--color-ink-muted)]">{t('common.loading')}</p>
      ) : issues.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--color-border)] py-12 text-center">
          <p className="font-mono text-sm text-[var(--color-ink-faint)]">{t('ticketIssues.empty')}</p>
        </div>
      ) : (
        <div className={`space-y-3 transition-opacity ${isFetching ? 'opacity-60' : 'opacity-100'}`}>
          {issues.map(issue => (
            <TicketIssueCard key={issue.id} issue={issue} onEdit={() => startEdit(issue)} />
          ))}
        </div>
      )}
    </main>
  )
}

function StatsPanel({ stats }: { stats: { total_count: number; code_count: number; operation_count: number } }) {
  const { t } = useI18n()
  const codePercent = stats.total_count ? Math.round(stats.code_count / stats.total_count * 100) : 0
  const operationPercent = stats.total_count ? Math.round(stats.operation_count / stats.total_count * 100) : 0

  return (
    <section className="mb-4 grid gap-3 sm:grid-cols-3">
      <StatCard label={t('ticketIssues.stats.total')} value={`${stats.total_count}`} note={t('ticketIssues.stats.range')} />
      <StatCard label={t('ticketIssues.cause.code')} value={`${stats.code_count}`} note={`${codePercent}%`} percent={codePercent} />
      <StatCard label={t('ticketIssues.cause.operation')} value={`${stats.operation_count}`} note={`${operationPercent}%`} percent={operationPercent} />
    </section>
  )
}

function StatCard({ label, value, note, percent }: { label: string; value: string; note: string; percent?: number }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-4">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">{label}</p>
      <div className="mt-2 flex items-end justify-between gap-2">
        <p className="font-mono text-3xl font-bold text-[var(--color-ink)]">{value}</p>
        <p className="font-mono text-xs text-[var(--color-ink-faint)]">{note}</p>
      </div>
      {percent !== undefined && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-hover)]">
          <div className="h-full rounded-full bg-[var(--color-solid)]" style={{ width: `${percent}%` }} />
        </div>
      )}
    </div>
  )
}

function TicketIssueForm({ issue, onClose }: { issue: TicketIssue | null; onClose: () => void }) {
  const { t } = useI18n()
  const [form, setForm] = useState<TicketIssueInput>(() => issue ? issueToInput(issue) : emptyIssue())
  const createMut = useCreateTicketIssue()
  const updateMut = useUpdateTicketIssue()
  const { toastError, toastSuccess } = useToast()
  const pending = createMut.isPending || updateMut.isPending

  const update = <K extends keyof TicketIssueInput>(key: K, value: TicketIssueInput[K]) => {
    setForm(current => ({ ...current, [key]: value }))
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.ticket_no.trim() || !form.problem_description.trim() || !form.cause_detail.trim()) {
      toastError(t('ticketIssues.form.required'))
      return
    }
    try {
      const data = {
        ...form,
        ticket_no: form.ticket_no.trim(),
        ticket_title: form.ticket_title.trim(),
        ticket_url: form.ticket_url.trim(),
        problem_description: form.problem_description.trim(),
        cause_detail: form.cause_detail.trim(),
        resolution: form.resolution.trim(),
      }
      if (issue) {
        await updateMut.mutateAsync({ id: issue.id, data })
        toastSuccess(t('ticketIssues.updated'))
      } else {
        await createMut.mutateAsync(data)
        toastSuccess(t('ticketIssues.saved'))
      }
      onClose()
    } catch (error: unknown) {
      toastError(error instanceof Error ? error.message : t('common.saveFailed'))
    }
  }

  return (
    <form onSubmit={submit} className="mb-4 rounded-lg border-2 border-[var(--color-border-strong)] bg-[var(--color-surface-strong)] p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-serif text-xl text-[var(--color-ink)]">{issue ? t('ticketIssues.form.editTitle', { no: issue.ticket_no }) : t('ticketIssues.form.createTitle')}</h2>
        <button type="button" onClick={onClose} className="font-mono text-sm text-[var(--color-ink-muted)]">{t('ticketIssues.form.close')}</button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('ticketIssues.form.ticketNo')}>
          <input value={form.ticket_no} onChange={event => update('ticket_no', event.target.value)} required className={issueInputClass} placeholder={t('ticketIssues.form.ticketNoPlaceholder')} />
        </Field>
        <Field label={t('ticketIssues.form.occurredOn')}>
          <input type="date" value={form.occurred_on} onChange={event => update('occurred_on', event.target.value)} required className={issueInputClass} />
        </Field>
        <Field label={t('ticketIssues.form.ticketTitle')}>
          <input value={form.ticket_title} onChange={event => update('ticket_title', event.target.value)} className={issueInputClass} placeholder={t('ticketIssues.form.ticketTitlePlaceholder')} />
        </Field>
        <Field label={t('ticketIssues.form.ticketUrl')}>
          <input type="url" value={form.ticket_url} onChange={event => update('ticket_url', event.target.value)} className={issueInputClass} placeholder="https://..." />
        </Field>
      </div>

      <fieldset className="mt-4">
        <legend className="mb-2 font-mono text-xs text-[var(--color-ink-muted)]">{t('ticketIssues.form.causeLegend')}</legend>
        <div className="flex gap-2">
          {([
            ['code', 'ticketIssues.cause.code'],
            ['operation', 'ticketIssues.cause.operation'],
          ] as const).map(([value, labelKey]) => (
            <label key={value} className={`cursor-pointer rounded-md border px-4 py-2 font-mono text-sm ${form.cause_type === value ? 'border-[var(--color-border-strong)] bg-[var(--color-surface-hover)] text-[var(--color-ink)]' : 'border-[var(--color-border)] text-[var(--color-ink-muted)]'}`}>
              <input type="radio" name="cause" value={value} checked={form.cause_type === value} onChange={() => update('cause_type', value)} className="sr-only" />
              {t(labelKey)}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-4 grid gap-3">
        <Field label={t('ticketIssues.form.problem')}>
          <textarea value={form.problem_description} onChange={event => update('problem_description', event.target.value)} required rows={3} className={`${issueInputClass} resize-y`} placeholder={t('ticketIssues.form.problemPlaceholder')} />
        </Field>
        <Field label={t('ticketIssues.form.cause')}>
          <textarea value={form.cause_detail} onChange={event => update('cause_detail', event.target.value)} required rows={3} className={`${issueInputClass} resize-y`} placeholder={t('ticketIssues.form.causePlaceholder')} />
        </Field>
        <Field label={t('ticketIssues.form.resolution')}>
          <textarea value={form.resolution} onChange={event => update('resolution', event.target.value)} rows={3} className={`${issueInputClass} resize-y`} placeholder={t('ticketIssues.form.resolutionPlaceholder')} />
        </Field>
      </div>

      <div className="mt-4 flex gap-2">
        <button type="submit" disabled={pending} className="rounded-md bg-[var(--color-solid)] px-5 py-2.5 font-mono text-sm text-[var(--color-solid-text)] disabled:opacity-50">
          {pending ? t('common.saving') : issue ? t('ticketIssues.form.saveEdit') : t('ticketIssues.form.saveNew')}
        </button>
        <button type="button" onClick={onClose} className="rounded-md border border-[var(--color-border)] px-5 py-2.5 font-mono text-sm text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)]">{t('common.cancel')}</button>
      </div>
    </form>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono text-xs text-[var(--color-ink-muted)]">{label}</span>
      {children}
    </label>
  )
}

function TicketIssueCard({ issue, onEdit }: { issue: TicketIssue; onEdit: () => void }) {
  const { t } = useI18n()
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const deleteMut = useDeleteTicketIssue()
  const { toastError, toastSuccess } = useToast()
  const causeLabel = issue.cause_type === 'code' ? t('ticketIssues.cause.code') : t('ticketIssues.cause.operation')

  const remove = async () => {
    try {
      await deleteMut.mutateAsync(issue.id)
      toastSuccess(t('ticketIssues.deleted'))
    } catch (error: unknown) {
      toastError(error instanceof Error ? error.message : t('common.deleteFailed'))
    }
  }

  return (
    <article className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-base font-bold text-[var(--color-ink)]">{issue.ticket_no}</span>
            <span className={`rounded-full px-2.5 py-1 font-mono text-xs ${issue.cause_type === 'code' ? 'bg-[var(--color-danger-bg)] text-[var(--color-danger-text)]' : 'bg-[var(--color-surface-hover)] text-[var(--color-ink-secondary)]'}`}>
              {causeLabel}
            </span>
            <span className="font-mono text-xs text-[var(--color-ink-faint)]">{formatDateDisplay(issue.occurred_on)}</span>
          </div>
          {issue.ticket_title && <h2 className="mt-2 font-serif text-xl text-[var(--color-ink)]">{issue.ticket_title}</h2>}
          {issue.ticket_url && (
            <a href={issue.ticket_url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block max-w-full truncate font-mono text-xs text-[var(--color-ink-muted)] underline underline-offset-2">
              {t('ticketIssues.openTicket')}
            </a>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onEdit} className="rounded px-2.5 py-1.5 font-mono text-xs text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)]">{t('common.edit')}</button>
          {confirmingDelete ? (
            <>
              <button onClick={remove} disabled={deleteMut.isPending} className="rounded bg-[var(--color-danger-bg)] px-2.5 py-1.5 font-mono text-xs text-[var(--color-danger-text)] disabled:opacity-50">{t('ticketIssues.confirmDelete')}</button>
              <button onClick={() => setConfirmingDelete(false)} className="rounded px-2 py-1.5 font-mono text-xs text-[var(--color-ink-muted)]">{t('common.cancel')}</button>
            </>
          ) : (
            <button onClick={() => setConfirmingDelete(true)} className="rounded px-2.5 py-1.5 font-mono text-xs text-[var(--color-danger-text)] hover:bg-[var(--color-danger-bg)]">{t('common.delete')}</button>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-4 border-t border-[var(--color-border)] pt-4 md:grid-cols-3">
        <ReviewBlock label={t('ticketIssues.block.problem')} content={issue.problem_description} />
        <ReviewBlock label={t('ticketIssues.block.cause')} content={issue.cause_detail} />
        <ReviewBlock label={t('ticketIssues.block.resolution')} content={issue.resolution || t('ticketIssues.noResolution')} muted={!issue.resolution} />
      </div>
    </article>
  )
}

function ReviewBlock({ label, content, muted = false }: { label: string; content: string; muted?: boolean }) {
  return (
    <div>
      <p className="mb-1.5 font-mono text-xs uppercase tracking-[0.15em] text-[var(--color-ink-faint)]">{label}</p>
      <p className={`whitespace-pre-wrap font-serif text-sm leading-6 ${muted ? 'text-[var(--color-ink-faint)]' : 'text-[var(--color-ink-secondary)]'}`}>{content}</p>
    </div>
  )
}

function issueToInput(issue: TicketIssue): TicketIssueInput {
  return {
    ticket_no: issue.ticket_no,
    ticket_title: issue.ticket_title,
    ticket_url: issue.ticket_url,
    occurred_on: issue.occurred_on,
    cause_type: issue.cause_type as TicketCauseType,
    problem_description: issue.problem_description,
    cause_detail: issue.cause_detail,
    resolution: issue.resolution,
  }
}
