import { useState, useEffect, useRef } from 'react'
import {
  type Checklist,
  type ChecklistSnapshot,
  type SnapshotData,
} from '../../lib/api'
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
  const [viewingRunId, setViewingRunId] = useState<number | null>(null)
  const [showSavedList, setShowSavedList] = useState(false)
  const [confirmDeleteRunId, setConfirmDeleteRunId] = useState<number | null>(null)

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
    const title = snapshotTitle.trim() || `检查 - ${new Date().toLocaleString('zh-CN')}`
    try {
      const data: SnapshotData = {
        notes: [...notes],
        extras: extras.map(e => ({ ...e })),
      }
      await createSnapshotMut.mutateAsync({ checklistId: checklist.id, title, itemsHash: hash, data })
      setSnapshotTitle('')
      setShowSavedList(true)
    } catch (e: unknown) {
      alert('保存失败：' + (e instanceof Error ? e.message : '未知错误'))
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
      alert('加载失败：' + (e instanceof Error ? e.message : '未知错误'))
    }
  }

  const deleteSnapshot = async (id: number) => {
    try {
      await deleteSnapshotMut.mutateAsync({ id, checklistId: checklist.id })
      if (viewingRunId === id) setViewingRunId(null)
    } catch (e: unknown) {
      alert('删除失败：' + (e instanceof Error ? e.message : '未知错误'))
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
        className="font-mono text-sm flex items-center gap-1 mb-4 transition-colors hover:text-[var(--color-ink)]"
        style={{ color: 'var(--color-ink-muted)' }}
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
        返回清单列表
      </button>

      <div
        className="rounded-lg p-6"
        style={{
          background: 'var(--color-surface-strong)',
          border: allDone ? '2px solid #22c55e' : '1px solid var(--color-border)',
          borderRadius: '8px',
        }}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="font-mono text-xl font-medium text-[var(--color-ink)] mb-1">{checklist.title}</h2>
            <p className="font-mono text-xs" style={{ color: 'var(--color-ink-muted)' }}>
              {checkedCount} / {totalCount} 项已填写
              {allDone && ' ✅ 全部完成！'}
            </p>
          </div>
          {(checkedCount > 0 || notes.some(n => n.trim() !== '')) && (
            <button
              onClick={startNewRun}
              className="font-mono text-xs px-3 py-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-hover)]"
              style={{ border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-ink-muted)' }}
            >
              {viewingRunId ? '新建一份' : '重置'}
            </button>
          )}
        </div>

        <div className="w-full h-1.5 rounded-full mb-6 overflow-hidden" style={{ background: 'var(--color-border)' }}>
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${progress}%`,
              background: allDone ? '#22c55e' : 'var(--color-solid)',
            }}
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
                    className="mt-0.5 w-5 h-5 rounded flex items-center justify-center shrink-0"
                    style={{
                      color: done ? '#22c55e' : 'var(--color-ink-faint)',
                    }}
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
                      <span className="font-mono text-xs" style={{ color: 'var(--color-ink-faint)' }}>
                        {idx + 1}
                      </span>
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-sm" style={{ color: 'var(--color-ink)', wordBreak: 'break-word' }}>
                      {it.text}
                    </p>
                    {it.note && (
                      <p
                        className="font-mono mt-0.5"
                        style={{
                          fontSize: '11px',
                          color: 'var(--color-ink-faint)',
                          wordBreak: 'break-word',
                        }}
                      >
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
                      placeholder="输入备注... (Esc 收起)"
                      rows={2}
                      autoFocus
                      className="font-mono text-xs w-full px-2.5 py-1.5 bg-[var(--color-surface-strong)]"
                      style={{
                        border: '1px solid var(--color-border)',
                        borderRadius: '6px',
                        outline: 'none',
                        color: 'var(--color-ink-secondary)',
                        minHeight: '2.5rem',
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Escape') setEditingNote(null)
                      }}
                    />
                  </div>
                ) : notes[idx] ? (
                  <div className="pl-11 pr-3 pb-2.5 cursor-pointer" onClick={() => setEditingNote(idx)}>
                    <p
                      className="font-mono text-xs whitespace-pre-wrap"
                      style={{ color: 'var(--color-ink-muted)', wordBreak: 'break-word' }}
                    >
                      📝 {notes[idx]}
                    </p>
                  </div>
                ) : null}
              </div>
            )
          })}

          {extras.length > 0 && (
            <div className="pt-2 mt-2" style={{ borderTop: '1px dashed var(--color-border)' }}>
              <p className="font-mono text-xs px-3 py-1" style={{ color: 'var(--color-ink-faint)' }}>
                临时添加（{extras.length}）
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
                        className="mt-0.5 w-5 h-5 rounded flex items-center justify-center shrink-0"
                        style={{ color: done ? '#22c55e' : 'var(--color-ink-faint)' }}
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
                      <span
                        className="font-mono text-sm flex-1"
                        style={{ color: 'var(--color-ink)', wordBreak: 'break-word' }}
                      >
                        {extra.text}
                      </span>
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          removeExtra(extra.id)
                        }}
                        className="shrink-0 font-mono text-xs px-1.5 py-0.5 rounded transition-colors hover:bg-[var(--color-surface-strong)]"
                        style={{ color: 'var(--color-danger-text, #c00)' }}
                        title="删除临时项"
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
                          placeholder="输入备注..."
                          rows={2}
                          autoFocus
                          className="font-mono text-xs w-full px-2.5 py-1.5 bg-[var(--color-surface-strong)]"
                          style={{
                            border: '1px solid var(--color-border)',
                            borderRadius: '6px',
                            outline: 'none',
                            color: 'var(--color-ink-secondary)',
                            minHeight: '2.5rem',
                          }}
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
                        <p
                          className="font-mono text-xs whitespace-pre-wrap"
                          style={{ color: 'var(--color-ink-muted)', wordBreak: 'break-word' }}
                        >
                          📝 {extra.note}
                        </p>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}

          <div className="pt-3 mt-2" style={{ borderTop: '1px dashed var(--color-border)' }}>
            <div className="flex items-center gap-2 px-3">
              <span className="font-mono text-sm shrink-0" style={{ color: 'var(--color-ink-faint)' }}>
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
                placeholder="临时添加检查项（仅本次进度使用，Enter 添加）"
                className="font-mono text-sm flex-1 px-2.5 py-1.5 bg-[var(--color-surface-strong)]"
                style={{ border: '1px dashed var(--color-border)', borderRadius: '6px', outline: 'none' }}
              />
              <button
                onClick={addExtra}
                disabled={!newExtraText.trim()}
                className="font-mono text-xs px-3 py-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-hover)] disabled:opacity-40"
                style={{ border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-ink-muted)' }}
              >
                添加
              </button>
            </div>
          </div>
        </div>

        {allDone && (
          <div className="mt-6 pt-4 text-center" style={{ borderTop: '1px solid var(--color-border)' }}>
            <p className="text-2xl mb-1">🎉</p>
            <p className="font-mono text-sm" style={{ color: '#22c55e', fontWeight: 500 }}>
              所有项目均已填写完毕
            </p>
          </div>
        )}
      </div>

      <div
        className="rounded-lg p-4 mt-4"
        style={{
          background: 'var(--color-surface-strong)',
          border: '1px solid var(--color-border)',
          borderRadius: '8px',
        }}
      >
        <p className="font-mono text-xs mb-2" style={{ color: 'var(--color-ink-muted)' }}>
          {viewingRunId
            ? '📂 正在查看已保存的记录，可修改后另存一份'
            : '💾 保存当前进度为一份快照（云端保存）'}
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
            placeholder={`快照标题（默认：检查 - ${new Date().toLocaleString('zh-CN')}）`}
            className="font-mono text-sm flex-1 min-w-[200px] px-3 py-2 bg-[var(--color-surface-strong)]"
            style={{ border: '1px solid var(--color-border)', borderRadius: '6px', outline: 'none' }}
          />
          <button
            onClick={saveSnapshot}
            disabled={createSnapshotMut.isPending || (checkedCount === 0 && notes.every(n => n.trim() === ''))}
            className="font-mono text-sm px-4 py-2 rounded-md text-[var(--color-solid-text)] transition-colors disabled:opacity-50"
            style={{ background: 'var(--color-solid)', borderRadius: '6px' }}
          >
            {createSnapshotMut.isPending ? '保存中...' : '保存快照'}
          </button>
        </div>
      </div>

      {!snapshotsLoading && savedRuns.length > 0 && (
        <div
          className="rounded-lg mt-4"
          style={{
            background: 'var(--color-surface-strong)',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
          }}
        >
          <button
            onClick={() => setShowSavedList(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 font-mono text-sm transition-colors hover:bg-[var(--color-surface-hover)]"
            style={{ color: 'var(--color-ink)', borderRadius: '8px' }}
          >
            <span>📚 已保存的快照 ({savedRuns.length})</span>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ transform: showSavedList ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {showSavedList && (
            <div style={{ borderTop: '1px solid var(--color-border)' }}>
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
                    className="flex items-center gap-2 px-4 py-2.5"
                    style={{
                      borderBottom: '1px solid var(--color-border)',
                      background: isViewing ? 'var(--color-surface-hover)' : 'transparent',
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-sm truncate" style={{ color: 'var(--color-ink)' }}>
                        {isViewing && '👁 '}
                        {run.title}
                        {!isMatch && (
                          <span className="ml-2 text-xs" style={{ color: 'var(--color-ink-faint)' }}>
                            （清单已变更）
                          </span>
                        )}
                      </p>
                      <p className="font-mono text-xs" style={{ color: 'var(--color-ink-faint)' }}>
                        {runNoteCount}/{runTotal} 项 · {new Date(run.created_at).toLocaleString('zh-CN')}
                      </p>
                    </div>
                    <button
                      onClick={() => loadSnapshot(run)}
                      disabled={!isMatch}
                      className="font-mono text-xs px-3 py-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-strong)] disabled:opacity-40"
                      style={{ border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-ink-muted)' }}
                      type="button"
                    >
                      查看
                    </button>
                    {confirmDeleteRunId === run.id ? (
                      <>
                        <button
                          onClick={() => deleteSnapshot(run.id)}
                          className="font-mono text-xs px-2 py-1.5 rounded-md transition-colors"
                          style={{ background: 'var(--color-danger-text, #c00)', color: '#fff', borderRadius: '6px' }}
                          type="button"
                        >
                          确认
                        </button>
                        <button
                          onClick={() => setConfirmDeleteRunId(null)}
                          className="font-mono text-xs px-2 py-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-strong)]"
                          style={{ color: 'var(--color-ink-muted)' }}
                          type="button"
                        >
                          取消
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteRunId(run.id)}
                        className="font-mono text-xs px-2 py-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-strong)]"
                        style={{ color: 'var(--color-danger-text, #c00)' }}
                        title="删除快照"
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

      <p className="font-mono text-xs text-center mt-4" style={{ color: 'var(--color-ink-faint)' }}>
        {lastSavedAt && !viewingRunId
          ? `💾 已恢复上次草稿 (${new Date(lastSavedAt).toLocaleString('zh-CN')})、草稿保存在本设备本地`
          : '💾 草稿保存在本设备本地，快照保存到云端'}
      </p>
    </div>
  )
}
