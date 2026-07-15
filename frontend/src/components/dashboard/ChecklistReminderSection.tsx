import { useEffect, useMemo, useState } from 'react'
import type { ChecklistReminder, ChecklistRun } from '../../lib/api'
import { useChecklistReminders, useSaveChecklistRun } from '../../lib/queries'
import { useToast } from '../../lib/toast-context'
import { parseItems } from '../checklists/checklist-utils'

interface RunData {
  checked?: boolean[]
  notes?: string[]
}

function readRunData(run: ChecklistRun | undefined, count: number) {
  let data: RunData = {}
  if (run?.data) {
    try {
      data = JSON.parse(run.data) as RunData
    } catch {
      data = {}
    }
  }
  return {
    checked: Array.from({ length: count }, (_, index) => data.checked?.[index] ?? false),
    notes: Array.from({ length: count }, (_, index) => data.notes?.[index] ?? ''),
  }
}

export function ChecklistReminderSection({ date, enabled }: { date: string; enabled: boolean }) {
  const { data, isLoading } = useChecklistReminders(date, enabled)
  const reminders = data?.reminders ?? []

  if (!enabled || (!isLoading && reminders.length === 0)) return null

  return (
    <section className="mb-6" aria-label="待完成检查清单">
      <div className="flex items-end justify-between gap-3 mb-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-ink-faint)] mb-1">
            CHECKLIST
          </p>
          <h2 className="font-mono text-lg font-semibold text-[var(--color-ink)]">今日待检查</h2>
        </div>
        <p className="hidden sm:block font-serif text-sm text-[var(--color-ink-muted)]">
          上班后先确认每日事项，Iteration 结束日会追加完整收尾检查。
        </p>
      </div>

      {isLoading ? (
        <div className="rounded-lg px-5 py-4 bg-[var(--color-surface-strong)] border border-[var(--color-border)]">
          <p className="font-mono text-sm text-[var(--color-ink-muted)]">正在加载检查项...</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {reminders.map(reminder => (
            <ReminderCard key={`${reminder.kind}:${reminder.occurrence_key}`} reminder={reminder} />
          ))}
        </div>
      )}
    </section>
  )
}

function ReminderCard({ reminder }: { reminder: ChecklistReminder }) {
  const items = useMemo(() => parseItems(reminder.checklist.items), [reminder.checklist.items])
  const initial = useMemo(() => readRunData(reminder.run, items.length), [reminder.run, items.length])
  const [checked, setChecked] = useState(initial.checked)
  const [notes, setNotes] = useState(initial.notes)
  const [expanded, setExpanded] = useState(!reminder.run?.completed)
  const [dirty, setDirty] = useState(false)
  const saveMut = useSaveChecklistRun()
  const { toastError, toastSuccess } = useToast()

  useEffect(() => {
    setChecked(initial.checked)
    setNotes(initial.notes)
    setDirty(false)
  }, [initial])

  const completedCount = checked.filter(Boolean).length
  const allChecked = items.length > 0 && completedCount === items.length
  const wasCompleted = reminder.run?.completed ?? false
  const isIteration = reminder.kind === 'iteration_end'

  const toggleItem = (index: number) => {
    setChecked(current => current.map((value, itemIndex) => itemIndex === index ? !value : value))
    setDirty(true)
  }

  const updateNote = (index: number, value: string) => {
    setNotes(current => current.map((note, itemIndex) => itemIndex === index ? value : note))
    setDirty(true)
  }

  const save = async () => {
    try {
      await saveMut.mutateAsync({
        checklist_id: reminder.checklist.id,
        kind: isIteration ? 'iteration_end' : 'daily_start',
        occurrence_key: reminder.occurrence_key,
        checked,
        notes,
      })
      setDirty(false)
      toastSuccess(allChecked ? '检查清单已完成' : '检查进度已保存')
      if (allChecked) setExpanded(false)
    } catch (error: unknown) {
      toastError(error instanceof Error ? error.message : '保存检查进度失败')
    }
  }

  return (
    <div className={`rounded-lg bg-[var(--color-surface-strong)] border ${
      (wasCompleted && !dirty) || (allChecked && dirty)
        ? 'border-[#22c55e]'
        : isIteration
          ? 'border-[var(--color-border-strong,var(--color-border))]'
          : 'border-[var(--color-border)]'
    }`}>
      <div className="flex items-start gap-3 px-5 py-4">
        <div className={`mt-0.5 w-9 h-9 rounded-md flex items-center justify-center shrink-0 font-mono text-sm ${
          (wasCompleted && !dirty) || (allChecked && dirty)
            ? 'bg-[#dcfce7] text-[#15803d]'
            : 'bg-[var(--color-surface)] text-[var(--color-ink-muted)]'
        }`}>
          {(wasCompleted && !dirty) || (allChecked && dirty) ? '✓' : isIteration ? 'I' : 'D'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-mono text-base font-semibold text-[var(--color-ink)]">
              {reminder.checklist.title}
            </h3>
            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-surface)] text-[var(--color-ink-muted)]">
              {reminder.label}
            </span>
            {reminder.iteration_number && (
              <span className="font-mono text-[10px] text-[var(--color-ink-faint)]">
                Iter {reminder.iteration_number} · {reminder.iteration_start} ~ {reminder.iteration_end}
              </span>
            )}
          </div>
          <p className="font-mono text-xs mt-1 text-[var(--color-ink-muted)]">
            {completedCount}/{items.length} 项已确认
            {dirty && ' · 有未保存修改'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(value => !value)}
          className="font-mono text-xs px-2.5 py-1.5 rounded-md border border-[var(--color-border)] text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)]"
        >
          {expanded ? '收起' : ((wasCompleted && !dirty) ? '查看' : '继续')}
        </button>
      </div>

      {expanded && (
        <div className="px-5 pb-5 border-t border-dashed border-[var(--color-border)]">
          <div className="divide-y divide-[var(--color-border)]">
            {items.map((item, index) => (
              <div key={`${item.text}:${index}`} className="py-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked[index] ?? false}
                    onChange={() => toggleItem(index)}
                    className="mt-0.5 w-4 h-4 shrink-0"
                  />
                  <span className={`font-mono text-sm leading-5 ${
                    checked[index]
                      ? 'text-[var(--color-ink-muted)] line-through'
                      : 'text-[var(--color-ink)]'
                  }`}>
                    {item.text}
                  </span>
                </label>
                {item.note && (
                  <p className="font-mono text-[11px] mt-1 ml-7 text-[var(--color-ink-faint)]">{item.note}</p>
                )}
                <input
                  type="text"
                  value={notes[index] ?? ''}
                  onChange={event => updateNote(index, event.target.value)}
                  placeholder="备注（可选）"
                  className="font-mono text-xs w-[calc(100%-1.75rem)] ml-7 mt-2 px-2.5 py-1.5 rounded-md outline-none bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-ink-muted)]"
                />
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 pt-4">
            <button
              type="button"
              onClick={save}
              disabled={saveMut.isPending || !dirty}
              className="font-mono text-sm px-4 py-2 rounded-md bg-[var(--color-solid)] text-[var(--color-solid-text)] disabled:opacity-40"
            >
              {saveMut.isPending ? '保存中...' : allChecked ? '完成检查' : '保存进度'}
            </button>
            <span className="font-serif text-sm text-[var(--color-ink-faint)]">
              勾选项目后请保存，备注不是必填项。
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
