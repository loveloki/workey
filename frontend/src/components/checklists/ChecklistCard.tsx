import { useState } from 'react'
import { type Checklist, type ChecklistItem } from '../../lib/api'
import { useToast } from '../../lib/toast-context'
import { ChecklistForm } from './ChecklistForm'
import { parseItems } from './checklist-utils'
import { useUpdateChecklist, useDeleteChecklist } from '../../lib/queries'
import { useI18n } from '../../lib/i18n'

export function ChecklistCard({
  checklist,
  onUse,
  onUpdated,
  onDeleted,
}: {
  checklist: Checklist
  onUse: () => void
  onUpdated: (cl: Checklist) => void
  onDeleted: () => void
}) {
  const { t } = useI18n()
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const { toastError } = useToast()
  const updateMut = useUpdateChecklist()
  const deleteMut = useDeleteChecklist()

  const parsedItems = parseItems(checklist.items)
  const kindLabel = t('checklists.kindManual')

  const handleEditSave = async (data: Checklist | { title: string; items: string }) => {
    try {
      const items: ChecklistItem[] = JSON.parse(data.items)
      const { checklist: updated } = await updateMut.mutateAsync({
        id: checklist.id,
        data: { title: data.title, items },
      })
      onUpdated(updated)
      setEditing(false)
    } catch (e: unknown) {
      toastError(e instanceof Error ? e.message : t('common.saveFailed'))
    }
  }

  const handleDelete = async () => {
    try {
      await deleteMut.mutateAsync(checklist.id)
      onDeleted()
    } catch (e: unknown) {
      toastError(e instanceof Error ? e.message : t('common.operationFailed'))
    }
  }

  if (editing) {
    return (
      <div className="sm:col-span-2">
        <ChecklistForm
          initial={{ title: checklist.title, items: parsedItems }}
          onSave={handleEditSave}
          onCancel={() => setEditing(false)}
        />
      </div>
    )
  }

  return (
    <div className="rounded-lg p-4 group transition-colors flex flex-col bg-[var(--color-surface-strong)] border border-[var(--color-border)]">
      <h3 className="font-mono text-base font-medium text-[var(--color-ink)] mb-2 flex items-start justify-between">
        <span className="flex items-center gap-2">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0 mt-0.5 text-[var(--color-ink-muted)]"
          >
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
          <span>
            {checklist.title}
            <span className="block font-mono text-[10px] font-normal mt-0.5 text-[var(--color-ink-faint)]">
              {kindLabel}
            </span>
          </span>
        </span>
        <span className="font-mono text-xs font-normal text-[var(--color-ink-faint)]">
          {t('checklists.itemCount', { count: parsedItems.length })}
        </span>
      </h3>

      <div className="flex-1 mb-3">
        <ul className="space-y-1.5">
          {parsedItems.slice(0, 4).map((it, idx) => (
            <li key={idx} className="font-mono text-xs text-[var(--color-ink-muted)]">
              <div className="flex items-start gap-2">
                <span className="shrink-0 mt-0.5 text-[var(--color-border-strong,var(--color-border))]">
                  ·
                </span>
                <span className="line-clamp-1">{it.text}</span>
              </div>
              {it.note && (
                <p className="pl-3.5 line-clamp-1 text-[10.5px] text-[var(--color-ink-faint)]">
                  {it.note}
                </p>
              )}
            </li>
          ))}
          {parsedItems.length > 4 && (
            <li className="font-mono text-xs text-[var(--color-ink-faint)]">
              {t('checklists.moreItems', { count: parsedItems.length - 4 })}
            </li>
          )}
        </ul>
      </div>

      <div className="flex items-center gap-2 pt-3 border-t border-t-[var(--color-border)]">
        <button
          onClick={onUse}
          className="font-mono text-xs px-4 py-1.5 rounded-md text-[var(--color-solid-text)] transition-colors bg-[var(--color-solid)]"
        >
          {t('checklists.startCheck')}
        </button>
        <button
          onClick={() => setEditing(true)}
          className="font-mono text-xs px-3 py-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-hover)] border border-[var(--color-border)] text-[var(--color-ink-muted)]"
        >
          {t('common.edit')}
        </button>
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="font-mono text-xs px-3 py-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-hover)] ml-auto text-[var(--color-danger-text,#c00)]"
          >
            {t('common.delete')}
          </button>
        ) : (
          <div className="flex items-center gap-1 ml-auto">
            <button
              onClick={handleDelete}
              className="font-mono text-xs px-3 py-1.5 rounded-md transition-colors bg-[var(--color-danger-text,#c00)] text-white"
            >
              {t('checklists.confirmDelete')}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="font-mono text-xs px-2 py-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-hover)] text-[var(--color-ink-muted)]"
            >
              {t('common.cancel')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
