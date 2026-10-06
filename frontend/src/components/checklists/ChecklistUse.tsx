import { useState, useEffect, useRef } from 'react'
import {
  type Checklist,
  type ChecklistSnapshot,
  type SnapshotData,
  type RecordID,
} from '../../lib/api'
import { useToast } from '../../lib/toast-context'
import { useI18n } from '../../lib/i18n'
import { AutoTextarea } from './AutoTextarea'
import { parseItems, itemsHash as computeItemsHash } from './checklist-utils'
import { useChecklistSnapshots, useCreateSnapshot, useDeleteSnapshot } from '../../lib/queries'

type ExtraItem = { id: string; text: string; note: string }

type DraftRun = {
  notes: string[]
  extras?: ExtraItem[]
  itemsHash: string
  updatedAt: string
}

export function ChecklistUse({ checklist, onBack }: { checklist: Checklist; onBack: () => void }) {
  const { t, locale } = useI18n()
  const { toastError } = useToast()
  const parsedItems = parseItems(checklist.items)
  const draftKey = `checklist-run:${checklist.id}`
  const hash = computeItemsHash(parsedItems)

  const loadDraft = (): DraftRun | null => {
    try {
      const raw = localStorage.getItem(draftKey)
      if (!raw) return null
      const parsed = JSON.parse(raw) as DraftRun
      if (parsed.itemsHash !== hash) return null
      if (!Array.isArray(parsed.notes) || parsed.notes.length !== parsedItems.length) return null
      return parsed
    } catch {
      return null
    }
  }

  const draft = loadDraft()

  const [notes, setNotes] = useState<string[]>(() => draft?.notes ?? parsedItems.map(() => ''))
  const [extras, setExtras] = useState<ExtraItem[]>(() => draft?.extras ?? [])
  const [editingNote, setEditingNote] = useState<number | null>(null)
  const [editingExtraNote, setEditingExtraNote] = useState<string | null>(null)
  const [newExtraText, setNewExtraText] = useState('')
  const newExtraRef = useRef<HTMLInputElement>(null)
  const [lastSavedAt] = useState<string | null>(draft?.updatedAt ?? null)

  const { data: snapshotsData, isLoading: snapshotsLoading } = useChecklistSnapshots(checklist.id)
  const createSnapshotMut = useCreateSnapshot()
  const deleteSnapshotMut = useDeleteSnapshot()
  const savedRuns = snapshotsData?.snapshots ?? []

  const [snapshotTitle, setSnapshotTitle] = useState('')
  const [viewingRunId, setViewingRunId] = useState<RecordID | null>(null)
  const [showSavedList, setShowSavedList] = useState(false)
  const [confirmDeleteRunId, setConfirmDeleteRunId] = useState<RecordID | null>(null)

  useEffect(() => {
    try {
      const hasAny = notes.some(n => n.trim() !== '') || extras.length > 0
      if (!hasAny) {
        localStorage.removeItem(draftKey)
        return
      }
      const payload: DraftRun = { notes, extras, itemsHash: hash, updatedAt: new Date().toISOString() }
      localStorage.setItem(draftKey, JSON.stringify(payload))
    } catch {
      /* ignore */
    }
  }, [notes, extras, draftKey, hash])

  const saveSnapshot = async () => {
    const title =
      snapshotTitle.trim() ||
      t('checklists.use.defaultSnapshotTitle', { time: new Date().toLocaleString(locale) })
    try {
      const data: SnapshotData = {
        notes: [...notes],
        extras: extras.map(e => ({ ...e })),
      }
      await createSnapshotMut.mutateAsync({ checklistId: checklist.id, title, itemsHash: hash, data })
      setSnapshotTitle('')
      setShowSavedList(true)
    } catch (e: unknown) {
      toastError(
        t('checklists.use.saveFailedMsg', {
          msg: e instanceof Error ? e.message : t('common.unknownError'),
        })
      )
    }
  }

  const loadSnapshot = (run: ChecklistSnapshot) => {
    try {
      const data = JSON.parse(run.data) as SnapshotData
      const loadedNotes: string[] = Array.isArray(data.notes) ? data.notes : []
      const filled: string[] = parsedItems.map((_, i) => loadedNotes[i] ?? '')
      setNotes(filled)
      setExtras(
        (data.extras ?? []).map((e: { id?: string; text?: string; note?: string }) => ({
          id: e.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          text: String(e.text || ''),
          note: String(e.note || ''),
        }))
      )
      setViewingRunId(run.id)
      setEditingNote(null)
      setEditingExtraNote(null)
    } catch (e: unknown) {
      toastError(
        t('checklists.use.loadFailedMsg', {
          msg: e instanceof Error ? e.message : t('common.unknownError'),
        })
      )
    }
  }

  const deleteSnapshot = async (id: RecordID) => {
    try {
      await deleteSnapshotMut.mutateAsync({ id, checklistId: checklist.id })
      if (viewingRunId === id) setViewingRunId(null)
    } catch (e: unknown) {
      toastError(
        t('checklists.use.deleteFailedMsg', {
          msg: e instanceof Error ? e.message : t('common.unknownError'),
        })
      )
    } finally {
      setConfirmDeleteRunId(null)
    }
  }

  const startNewRun = () => {
    setNotes(parsedItems.map(() => ''))
    setExtras([])
    setViewingRunId(null)
    setEditingNote(null)
    setEditingExtraNote(null)
    try {
      localStorage.removeItem(draftKey)
    } catch {
      /* ignore */
    }
  }

  const addExtra = () => {
    const text = newExtraText.trim()
    if (!text) return
    setExtras(prev => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text,
        note: '',
      },
    ])
    setNewExtraText('')
    setTimeout(() => newExtraRef.current?.focus(), 0)
  }

  const updateExtraNote = (id: string, note: string) => {
    setExtras(prev => prev.map(e => (e.id === id ? { ...e, note } : e)))
  }

  const removeExtra = (id: string) => {
    setExtras(prev => prev.filter(e => e.id !== id))
    if (editingExtraNote === id) setEditingExtraNote(null)
  }

  const updateNote = (idx: number, val: string) => {
    setNotes(prev => prev.map((v, i) => (i === idx ? val : v)))
  }

  const isDone = (idx: number) => notes[idx]?.trim() !== ''
  const isExtraDone = (e: ExtraItem) => e.note.trim() !== ''
  const checkedCount = notes.filter(n => n.trim() !== '').length + extras.filter(isExtraDone).length
  const totalCount = parsedItems.length + extras.length
  const allDone = checkedCount === totalCount && totalCount > 0
  const progress = totalCount > 0 ? (checkedCount / totalCount) * 100 : 0

  return (
    <div>
      <button
        onClick={onBack}
        className="font-mono text-sm flex items-center gap-1 mb-4 transition-colors hover:text-[var(--color-ink)] text-[var(--color-ink-muted)]"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>
        {t('checklists.use.backToList')}
      </button>

      <div
        className={
          'rounded-lg p-6 bg-[var(--color-surface-strong)] ' +
          (allDone ? 'border-2 border-[#22c55e]' : 'border border-[var(--color-border)]')
        }
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="font-mono text-xl font-medium text-[var(--color-ink)] mb-1">{checklist.title}</h2>
            <p className="font-mono text-xs text-[var(--color-ink-muted)]">
              {t('checklists.use.filledCount', { done: checkedCount, total: totalCount })}
              {allDone && t('checklists.use.allDoneBadge')}
            </p>
          </div>
          {(checkedCount > 0 || notes.some(n => n.trim() !== '')) && (
            <button
              onClick={startNewRun}
              className="font-mono text-xs px-3 py-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-hover)] border border-[var(--color-border)] text-[var(--color-ink-muted)]"
            >
              {viewingRunId ? t('checklists.use.newCopy') : t('checklists.use.reset')}
            </button>
          )}
        </div>

        <div className="w-full h-1.5 rounded-full mb-6 overflow-hidden bg-[var(--color-border)]">
          <div
            className={
              'h-full rounded-full transition-all duration-300 ' +
              (allDone ? 'bg-[#22c55e]' : 'bg-[var(--color-solid)]')
            }
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="space-y-1">
          {parsedItems.map((it, idx) => {
            const done = isDone(idx)
            const editing = editingNote === idx
            return (
              <div key={idx} className="rounded-md transition-colors hover:bg-[var(--color-surface-hover)]">
                <div
                  className="flex items-start gap-3 px-3 py-2.5 cursor-pointer"
                  onClick={() => setEditingNote(editing ? null : idx)}
                >
                  <span
                    className={
                      'mt-0.5 w-5 h-5 rounded flex items-center justify-center shrink-0 ' +
                      (done ? 'text-[#22c55e]' : 'text-[var(--color-ink-faint)]')
                    }
                    aria-hidden
                  >
                    {done ? (
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      <span className="font-mono text-xs text-[var(--color-ink-faint)]">
                        {idx + 1}
                      </span>
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-sm text-[var(--color-ink)] break-words">
                      {it.text}
                    </p>
                    {it.note && (
                      <p className="font-mono mt-0.5 text-[11px] text-[var(--color-ink-faint)] break-words">
                        {it.note}
                      </p>
                    )}
                  </div>
                </div>
                {editing ? (
                  <div className="pl-11 pr-3 pb-2.5" onClick={e => e.stopPropagation()}>
                    <AutoTextarea
                      value={notes[idx]}
                      onChange={e => updateNote(idx, (e.target as HTMLTextAreaElement).value)}
                      placeholder={t('checklists.use.notePlaceholderEsc')}
                      rows={2}
                      autoFocus
                      className="font-mono text-xs w-full px-2.5 py-1.5 bg-[var(--color-surface-strong)] border border-[var(--color-border)] rounded-md outline-none text-[var(--color-ink-secondary)] min-h-[2.5rem]"
                      onKeyDown={e => {
                        if (e.key === 'Escape') setEditingNote(null)
                      }}
                    />
                  </div>
                ) : notes[idx] ? (
                  <div className="pl-11 pr-3 pb-2.5 cursor-pointer" onClick={() => setEditingNote(idx)}>
                    <p className="font-mono text-xs whitespace-pre-wrap text-[var(--color-ink-muted)] break-words">
                      📝 {notes[idx]}
                    </p>
                  </div>
                ) : null}
              </div>
            )
          })}

          {extras.length > 0 && (
            <div className="pt-2 mt-2 border-t border-dashed border-t-[var(--color-border)]">
              <p className="font-mono text-xs px-3 py-1 text-[var(--color-ink-faint)]">
                {t('checklists.use.extrasTitle', { count: extras.length })}
              </p>
              {extras.map(extra => {
                const done = isExtraDone(extra)
                const editing = editingExtraNote === extra.id
                return (
                  <div
                    key={extra.id}
                    className="rounded-md transition-colors hover:bg-[var(--color-surface-hover)] group"
                  >
                    <div
                      className="flex items-start gap-3 px-3 py-2.5 cursor-pointer"
                      onClick={() => setEditingExtraNote(editing ? null : extra.id)}
                    >
                      <span
                        className={
                          'mt-0.5 w-5 h-5 rounded flex items-center justify-center shrink-0 ' +
                          (done ? 'text-[#22c55e]' : 'text-[var(--color-ink-faint)]')
                        }
                        aria-hidden
                      >
                        {done ? (
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        ) : (
                          '+'
                        )}
                      </span>
                      <span className="font-mono text-sm flex-1 text-[var(--color-ink)] break-words">
                        {extra.text}
                      </span>
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          removeExtra(extra.id)
                        }}
                        className="shrink-0 font-mono text-xs px-1.5 py-0.5 rounded transition-colors hover:bg-[var(--color-surface-strong)] text-[var(--color-danger-text,#c00)]"
                        title={t('checklists.use.deleteExtra')}
                      >
                        ✕
                      </button>
                    </div>
                    {editing ? (
                      <div className="pl-11 pr-3 pb-2.5" onClick={e => e.stopPropagation()}>
                        <AutoTextarea
                          value={extra.note}
                          onChange={e =>
                            updateExtraNote(extra.id, (e.target as HTMLTextAreaElement).value)
                          }
                          placeholder={t('checklists.use.notePlaceholder')}
                          rows={2}
                          autoFocus
                          className="font-mono text-xs w-full px-2.5 py-1.5 bg-[var(--color-surface-strong)] border border-[var(--color-border)] rounded-md outline-none text-[var(--color-ink-secondary)] min-h-[2.5rem]"
                          onKeyDown={e => {
                            if (e.key === 'Escape') setEditingExtraNote(null)
                          }}
                        />
                      </div>
                    ) : extra.note ? (
                      <div
                        className="pl-11 pr-3 pb-2.5 cursor-pointer"
                        onClick={() => setEditingExtraNote(extra.id)}
                      >
                        <p className="font-mono text-xs whitespace-pre-wrap text-[var(--color-ink-muted)] break-words">
                          📝 {extra.note}
                        </p>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}

          <div className="pt-3 mt-2 border-t border-dashed border-t-[var(--color-border)]">
            <div className="flex items-center gap-2 px-3">
              <span className="font-mono text-sm shrink-0 text-[var(--color-ink-faint)]">
                +
              </span>
              <input
                ref={newExtraRef}
                type="text"
                value={newExtraText}
                onChange={e => setNewExtraText(e.target.value)}
                onKeyDown={e => {
                  if (e.nativeEvent.isComposing || e.keyCode === 229) return
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addExtra()
                  }
                }}
                placeholder={t('checklists.use.addExtraPlaceholder')}
                className="font-mono text-sm flex-1 px-2.5 py-1.5 bg-[var(--color-surface-strong)] border border-dashed border-[var(--color-border)] rounded-md outline-none"
              />
              <button
                onClick={addExtra}
                disabled={!newExtraText.trim()}
                className="font-mono text-xs px-3 py-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-hover)] disabled:opacity-40 border border-[var(--color-border)] text-[var(--color-ink-muted)]"
              >
                {t('checklists.use.add')}
              </button>
            </div>
          </div>
        </div>

        {allDone && (
          <div className="mt-6 pt-4 text-center border-t border-t-[var(--color-border)]">
            <p className="text-2xl mb-1">🎉</p>
            <p className="font-mono text-sm text-[#22c55e] font-medium">
              {t('checklists.use.allFilled')}
            </p>
          </div>
        )}
      </div>

      <div className="rounded-lg p-4 mt-4 bg-[var(--color-surface-strong)] border border-[var(--color-border)]">
        <p className="font-mono text-xs mb-2 text-[var(--color-ink-muted)]">
          {viewingRunId
            ? t('checklists.use.viewingHint')
            : t('checklists.use.saveHint')}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            value={snapshotTitle}
            onChange={e => setSnapshotTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                saveSnapshot()
              }
            }}
            placeholder={t('checklists.use.snapshotTitlePlaceholder', {
              time: new Date().toLocaleString(locale),
            })}
            className="font-mono text-sm flex-1 min-w-[200px] px-3 py-2 bg-[var(--color-surface-strong)] border border-[var(--color-border)] rounded-md outline-none"
          />
          <button
            onClick={saveSnapshot}
            disabled={createSnapshotMut.isPending || (checkedCount === 0 && notes.every(n => n.trim() === ''))}
            className="font-mono text-sm px-4 py-2 rounded-md text-[var(--color-solid-text)] transition-colors disabled:opacity-50 bg-[var(--color-solid)]"
          >
            {createSnapshotMut.isPending ? t('common.saving') : t('checklists.use.saveSnapshot')}
          </button>
        </div>
      </div>

      {!snapshotsLoading && savedRuns.length > 0 && (
        <div className="rounded-lg mt-4 bg-[var(--color-surface-strong)] border border-[var(--color-border)]">
          <button
            onClick={() => setShowSavedList(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 font-mono text-sm transition-colors hover:bg-[var(--color-surface-hover)] text-[var(--color-ink)] rounded-lg"
          >
            <span>{t('checklists.use.savedSnapshots', { count: savedRuns.length })}</span>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={
                'transition-transform duration-200 ' + (showSavedList ? 'rotate-180' : '')
              }
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {showSavedList && (
            <div className="border-t border-t-[var(--color-border)]">
              {savedRuns.map(run => {
                let runNoteCount = 0
                let runTotal = parsedItems.length
                try {
                  const d = JSON.parse(run.data) as SnapshotData
                  if (Array.isArray(d.notes))
                    runNoteCount += d.notes.filter((n: string) => n && n.trim() !== '').length
                  if (Array.isArray(d.extras)) {
                    runTotal += d.extras.length
                    runNoteCount += d.extras.filter((e: { note?: string }) => e?.note && e.note.trim() !== '').length
                  }
                } catch {
                  /* ignore */
                }
                const isViewing = viewingRunId === run.id
                const isMatch = run.items_hash === hash
                return (
                  <div
                    key={run.id}
                    className={
                      'flex items-center gap-2 px-4 py-2.5 border-b border-b-[var(--color-border)] ' +
                      (isViewing ? 'bg-[var(--color-surface-hover)]' : 'bg-transparent')
                    }
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-sm truncate text-[var(--color-ink)]">
                        {isViewing && '👁 '}
                        {run.title}
                        {!isMatch && (
                          <span className="ml-2 text-xs text-[var(--color-ink-faint)]">
                            {t('checklists.use.listChanged')}
                          </span>
                        )}
                      </p>
                      <p className="font-mono text-xs text-[var(--color-ink-faint)]">
                        {t('checklists.use.snapshotMeta', {
                          done: runNoteCount,
                          total: runTotal,
                          time: new Date(run.created_at).toLocaleString(locale),
                        })}
                      </p>
                    </div>
                    <button
                      onClick={() => loadSnapshot(run)}
                      disabled={!isMatch}
                      className="font-mono text-xs px-3 py-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-strong)] disabled:opacity-40 border border-[var(--color-border)] text-[var(--color-ink-muted)]"
                      type="button"
                    >
                      {t('checklists.use.view')}
                    </button>
                    {confirmDeleteRunId === run.id ? (
                      <>
                        <button
                          onClick={() => deleteSnapshot(run.id)}
                          className="font-mono text-xs px-2 py-1.5 rounded-md transition-colors bg-[var(--color-danger-text,#c00)] text-white"
                          type="button"
                        >
                          {t('common.confirm')}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteRunId(null)}
                          className="font-mono text-xs px-2 py-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-strong)] text-[var(--color-ink-muted)]"
                          type="button"
                        >
                          {t('common.cancel')}
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteRunId(run.id)}
                        className="font-mono text-xs px-2 py-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-strong)] text-[var(--color-danger-text,#c00)]"
                        title={t('checklists.use.deleteSnapshot')}
                        type="button"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      <p className="font-mono text-xs text-center mt-4 text-[var(--color-ink-faint)]">
        {lastSavedAt && !viewingRunId
          ? t('checklists.use.draftRestored', { time: new Date(lastSavedAt).toLocaleString(locale) })
          : t('checklists.use.draftHint')}
      </p>
    </div>
  )
}
