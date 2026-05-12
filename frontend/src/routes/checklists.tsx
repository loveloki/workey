import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useAuth } from '../lib/auth-context'
import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import {
  checklists as checklistsApi,
  checklistSnapshots as snapshotsApi,
  type Checklist,
  type ChecklistItem,
  type ChecklistSnapshot,
} from '../lib/api'

export const Route = createFileRoute('/checklists')({ component: ChecklistsPage })

/* ── parsing helpers (backward-compatible: legacy = string[]) ── */
function parseItems(raw: string): ChecklistItem[] {
  try {
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr.map((it: any) =>
      typeof it === 'string' ? { text: it } : { text: String(it?.text ?? ''), note: it?.note || undefined }
    )
  } catch { return [] }
}
function itemsHash(items: ChecklistItem[]): string {
  return JSON.stringify(items.map(i => ({ text: i.text, note: i.note || '' })))
}

function ChecklistsPage() {
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: '/login' })
  }, [authLoading, user, navigate])

  if (authLoading) return <LoadingScreen />
  if (!user) return null

  return (
    <main className="max-w-5xl mx-auto px-4 pb-8 pt-8">
      <div className="mb-6">
        <p className="mb-1 font-mono text-sm uppercase tracking-[0.3em] text-[var(--color-ink-secondary)]">
          § 检查清单
        </p>
        <h1
          className="text-3xl font-normal tracking-tight text-[var(--color-ink)] sm:text-4xl"
          style={{ fontFamily: 'Georgia, serif' }}
        >
          Checklists
        </h1>
      </div>
      <ChecklistManager />
    </main>
  )
}

/* ── Auto-growing textarea hook ─────────────────────────────── */
function useAutoGrow<T extends HTMLTextAreaElement>(value: string) {
  const ref = useRef<T | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }, [value])
  return ref
}

function AutoTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useAutoGrow<HTMLTextAreaElement>(String(props.value ?? ''))
  return <textarea ref={ref} {...props} style={{ ...(props.style || {}), overflow: 'hidden', resize: 'none' }} />
}

/* ── Checklist Manager ─────────────────────────────────────── */

function ChecklistManager() {
  const [items, setItems] = useState<Checklist[]>([])
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const load = async () => {
    const data = await checklistsApi.list()
    setItems(data.checklists)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleCreated = (cl: Checklist) => {
    setItems(prev => [cl, ...prev])
    setShowCreate(false)
  }

  const handleUpdated = (cl: Checklist) => {
    setItems(prev => prev.map(c => c.id === cl.id ? cl : c))
  }

  const handleDeleted = (id: number) => {
    setItems(prev => prev.filter(c => c.id !== id))
    if (activeId === id) setActiveId(null)
  }

  const activeChecklist = items.find(c => c.id === activeId)
  if (activeChecklist) {
    return (
      <ChecklistUse
        checklist={activeChecklist}
        onBack={() => setActiveId(null)}
      />
    )
  }

  return (
    <div>
      {!showCreate && (
        <button
          onClick={() => setShowCreate(true)}
          className="font-mono text-sm px-5 py-2.5 rounded-md text-[var(--color-solid-text)] transition-colors mb-6"
          style={{ background: 'var(--color-solid)', borderRadius: '6px' }}
        >
          + 新建清单
        </button>
      )}

      {showCreate && (
        <ChecklistForm
          onSave={handleCreated}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {loading ? (
        <p className="font-mono text-sm text-center py-8" style={{ color: 'var(--color-ink-muted)' }}>加载中...</p>
      ) : items.length === 0 && !showCreate ? (
        <div
          className="rounded-lg py-12 text-center"
          style={{ border: '1px dashed var(--color-border)' }}
        >
          <p className="font-mono text-sm" style={{ color: 'var(--color-ink-faint)' }}>暂无检查清单</p>
          <p className="text-sm mt-1" style={{ fontFamily: 'Georgia, serif', color: 'var(--color-ink-faint)' }}>
            点击上方按钮创建你的第一个清单
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {items.map(cl => (
            <ChecklistCard
              key={cl.id}
              checklist={cl}
              onUse={() => setActiveId(cl.id)}
              onUpdated={handleUpdated}
              onDeleted={() => handleDeleted(cl.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Create / Edit Form ────────────────────────────────────── */

function ChecklistForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: { title: string; items: ChecklistItem[] }
  onSave: (cl: Checklist) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState(initial?.title || '')
  const [items, setItems] = useState<ChecklistItem[]>(
    initial?.items?.length ? initial.items.map(i => ({ ...i })) : [{ text: '' }]
  )
  const [saving, setSaving] = useState(false)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const itemRefs = useRef<(HTMLInputElement | null)[]>([])

  const reorder = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return
    setItems(prev => {
      const next = [...prev]
      const [m] = next.splice(from, 1)
      next.splice(to, 0, m)
      return next
    })
  }

  useEffect(() => { titleRef.current?.focus() }, [])

  const addItem = () => {
    setItems(prev => [...prev, { text: '' }])
    setTimeout(() => { itemRefs.current[items.length]?.focus() }, 0)
  }
  const removeItem = (idx: number) => {
    if (items.length <= 1) return
    setItems(prev => prev.filter((_, i) => i !== idx))
  }
  const updateText = (idx: number, val: string) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, text: val } : it))
  }
  const updateNote = (idx: number, val: string) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, note: val } : it))
  }

  const handleItemKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, idx: number) => {
    if (e.nativeEvent.isComposing || (e as any).keyCode === 229) return
    if (e.key === 'Enter') {
      e.preventDefault()
      addItem()
    } else if (e.key === 'Backspace' && items[idx].text === '' && !items[idx].note && items.length > 1) {
      e.preventDefault()
      removeItem(idx)
      setTimeout(() => {
        const prevIdx = Math.max(0, idx - 1)
        itemRefs.current[prevIdx]?.focus()
      }, 0)
    }
  }

  const handleSave = async () => {
    if (!title.trim()) return
    const filtered = items
      .map(it => ({ text: it.text.trim(), note: (it.note || '').trim() || undefined }))
      .filter(it => it.text !== '')
    if (filtered.length === 0) return
    setSaving(true)
    try {
      if (initial) {
        onSave({ title: title.trim(), items: JSON.stringify(filtered) } as any)
      } else {
        const { checklist } = await checklistsApi.create(title.trim(), filtered)
        onSave(checklist)
      }
    } catch (err: any) {
      alert(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="rounded-lg p-5 mb-6"
      style={{ background: 'var(--color-surface-strong)', border: '2px solid var(--color-ink)', borderRadius: '8px' }}
    >
      <input
        ref={titleRef}
        type="text"
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="清单标题，如：上线前检查、代码评审..."
        className="font-mono text-base w-full px-3 py-2 mb-4 bg-[var(--color-surface-strong)]"
        style={{ border: '1px solid var(--color-border)', borderRadius: '6px', outline: 'none', fontWeight: 500 }}
      />

      <p className="font-mono text-xs mb-2" style={{ color: 'var(--color-ink-muted)' }}>检查项目：</p>

      <div className="space-y-2 mb-4">
        {items.map((it, idx) => {
          const isDragging = dragIdx === idx
          const isDragOver = dragOverIdx === idx && dragIdx !== null && dragIdx !== idx
          return (
            <div
              key={idx}
              className="flex items-start gap-2"
              onDragOver={e => {
                if (dragIdx === null) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                if (dragOverIdx !== idx) setDragOverIdx(idx)
              }}
              onDrop={e => {
                if (dragIdx === null) return
                e.preventDefault()
                reorder(dragIdx, idx)
                setDragIdx(null)
                setDragOverIdx(null)
              }}
              style={{
                opacity: isDragging ? 0.4 : 1,
                borderTop: isDragOver && (dragIdx ?? -1) > idx ? '2px solid var(--color-solid)' : '2px solid transparent',
                borderBottom: isDragOver && (dragIdx ?? -1) < idx ? '2px solid var(--color-solid)' : '2px solid transparent',
                transition: 'opacity 0.15s',
              }}
            >
              <button
                type="button"
                draggable
                onDragStart={e => {
                  setDragIdx(idx)
                  e.dataTransfer.effectAllowed = 'move'
                  try { e.dataTransfer.setData('text/plain', String(idx)) } catch {}
                }}
                onDragEnd={() => { setDragIdx(null); setDragOverIdx(null) }}
                className="font-mono text-sm shrink-0 px-1 select-none transition-colors hover:text-[var(--color-ink)] mt-1.5"
                style={{ color: 'var(--color-ink-faint)', cursor: 'grab', touchAction: 'none' }}
                title="拖动调整顺序"
                aria-label="拖动手柄"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <circle cx="9" cy="5" r="1.6" /><circle cx="15" cy="5" r="1.6" />
                  <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
                  <circle cx="9" cy="19" r="1.6" /><circle cx="15" cy="19" r="1.6" />
                </svg>
              </button>
              <span className="font-mono text-xs w-5 text-right shrink-0 mt-2" style={{ color: 'var(--color-ink-faint)' }}>
                {idx + 1}.
              </span>
              <div className="flex-1 flex flex-col gap-1">
                <input
                  ref={el => { itemRefs.current[idx] = el }}
                  type="text"
                  value={it.text}
                  onChange={e => updateText(idx, e.target.value)}
                  onKeyDown={e => handleItemKeyDown(e, idx)}
                  placeholder="输入检查项..."
                  className="font-mono text-sm w-full px-3 py-1.5 bg-[var(--color-surface-strong)]"
                  style={{ border: '1px solid var(--color-border)', borderRadius: '6px', outline: 'none' }}
                />
                <input
                  type="text"
                  value={it.note || ''}
                  onChange={e => updateNote(idx, e.target.value)}
                  placeholder="备注（可选，将显示在标题下方）"
                  className="font-mono text-xs w-full px-3 py-1 bg-[var(--color-surface-strong)]"
                  style={{ border: '1px dashed var(--color-border)', borderRadius: '6px', outline: 'none', color: 'var(--color-ink-muted)' }}
                />
              </div>
              <div className="flex flex-col gap-0.5">
                {items.length > 1 && idx > 0 && (
                  <button type="button" onClick={() => reorder(idx, idx - 1)}
                    className="font-mono text-xs w-6 h-6 rounded hover:bg-[var(--color-surface-hover)] shrink-0 transition-colors"
                    style={{ color: 'var(--color-ink-faint)' }} title="上移" aria-label="上移">↑</button>
                )}
                {items.length > 1 && idx < items.length - 1 && (
                  <button type="button" onClick={() => reorder(idx, idx + 1)}
                    className="font-mono text-xs w-6 h-6 rounded hover:bg-[var(--color-surface-hover)] shrink-0 transition-colors"
                    style={{ color: 'var(--color-ink-faint)' }} title="下移" aria-label="下移">↓</button>
                )}
              </div>
              {items.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeItem(idx)}
                  className="font-mono text-xs w-6 h-6 rounded hover:bg-[var(--color-danger-bg)] shrink-0 transition-colors mt-1"
                  style={{ color: 'var(--color-danger-text, #c00)' }}
                >
                  ✕
                </button>
              )}
            </div>
          )
        })}
      </div>

      <button
        onClick={addItem}
        className="font-mono text-xs px-3 py-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-hover)] mb-4"
        style={{ border: '1px dashed var(--color-border)', borderRadius: '6px', color: 'var(--color-ink-muted)' }}
      >
        + 添加检查项
      </button>

      <div className="flex items-center gap-2 pt-2" style={{ borderTop: '1px solid var(--color-border)' }}>
        <button
          onClick={handleSave}
          disabled={saving || !title.trim() || items.every(t => !t.text.trim())}
          className="font-mono text-sm px-5 py-2 rounded-md text-[var(--color-solid-text)] transition-colors disabled:opacity-50"
          style={{ background: 'var(--color-solid)', borderRadius: '6px' }}
        >
          {saving ? '保存中...' : '保存'}
        </button>
        <button
          onClick={onCancel}
          className="font-mono text-sm px-5 py-2 rounded-md transition-colors hover:bg-[var(--color-surface-hover)]"
          style={{ border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-ink-muted)' }}
        >
          取消
        </button>
        <span className="font-mono text-xs" style={{ color: 'var(--color-ink-faint)' }}>
Enter 添加新项 · 拖动⋮⋮ 或 ↑↓ 调整顺序
        </span>
      </div>
    </div>
  )
}

/* ── Checklist Card ────────────────────────────────────────── */

function ChecklistCard({
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
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const parsedItems = parseItems(checklist.items)

  const handleEditSave = async (data: any) => {
    try {
      const items: ChecklistItem[] = JSON.parse(data.items)
      const { checklist: updated } = await checklistsApi.update(checklist.id, {
        title: data.title,
        items,
      })
      onUpdated(updated)
      setEditing(false)
    } catch (err: any) {
      alert(err.message)
    }
  }

  const handleDelete = async () => {
    try {
      await checklistsApi.delete(checklist.id)
      onDeleted()
    } catch (err: any) {
      alert(err.message)
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
    <div
      className="rounded-lg p-4 group transition-colors flex flex-col"
      style={{
        background: 'var(--color-surface-strong)',
        border: '1px solid var(--color-border)',
        borderRadius: '8px',
      }}
    >
      <h3 className="font-mono text-base font-medium text-[var(--color-ink)] mb-2 flex items-start justify-between">
        <span className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5" style={{ color: 'var(--color-ink-muted)' }}>
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
          {checklist.title}
        </span>
        <span className="font-mono text-xs font-normal" style={{ color: 'var(--color-ink-faint)' }}>
          {parsedItems.length} 项
        </span>
      </h3>

      <div className="flex-1 mb-3">
        <ul className="space-y-1.5">
          {parsedItems.slice(0, 4).map((it, idx) => (
            <li key={idx} className="font-mono text-xs" style={{ color: 'var(--color-ink-muted)' }}>
              <div className="flex items-start gap-2">
                <span className="shrink-0 mt-0.5" style={{ color: 'var(--color-border-strong, var(--color-border))' }}>·</span>
                <span className="line-clamp-1">{it.text}</span>
              </div>
              {it.note && (
                <p className="pl-3.5 line-clamp-1" style={{ fontSize: '10.5px', color: 'var(--color-ink-faint)' }}>
                  {it.note}
                </p>
              )}
            </li>
          ))}
          {parsedItems.length > 4 && (
            <li className="font-mono text-xs" style={{ color: 'var(--color-ink-faint)' }}>
              ... 还有 {parsedItems.length - 4} 项
            </li>
          )}
        </ul>
      </div>

      <div className="flex items-center gap-2 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
        <button
          onClick={onUse}
          className="font-mono text-xs px-4 py-1.5 rounded-md text-[var(--color-solid-text)] transition-colors"
          style={{ background: 'var(--color-solid)', borderRadius: '6px' }}
        >
          开始检查
        </button>
        <button
          onClick={() => setEditing(true)}
          className="font-mono text-xs px-3 py-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-hover)]"
          style={{ border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-ink-muted)' }}
        >
          编辑
        </button>
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="font-mono text-xs px-3 py-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-hover)] ml-auto"
            style={{ color: 'var(--color-danger-text, #c00)' }}
          >
            删除
          </button>
        ) : (
          <div className="flex items-center gap-1 ml-auto">
            <button
              onClick={handleDelete}
              className="font-mono text-xs px-3 py-1.5 rounded-md transition-colors"
              style={{ background: 'var(--color-danger-text, #c00)', color: '#fff', borderRadius: '6px' }}
            >
              确认删除
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="font-mono text-xs px-2 py-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-hover)]"
              style={{ color: 'var(--color-ink-muted)' }}
            >
              取消
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Checklist Use ─────────────────────────────────────────── */

type ExtraItem = { id: string; text: string; note: string }

type DraftRun = {
  notes: string[]
  extras?: ExtraItem[]
  itemsHash: string
  updatedAt: string
}

function ChecklistUse({
  checklist,
  onBack,
}: {
  checklist: Checklist
  onBack: () => void
}) {
  const parsedItems = parseItems(checklist.items)
  const draftKey = `checklist-run:${checklist.id}`
  const hash = itemsHash(parsedItems)

  const loadDraft = (): DraftRun | null => {
    try {
      const raw = localStorage.getItem(draftKey)
      if (!raw) return null
      const parsed = JSON.parse(raw) as DraftRun
      if (parsed.itemsHash !== hash) return null
      if (!Array.isArray(parsed.notes) || parsed.notes.length !== parsedItems.length) return null
      return parsed
    } catch { return null }
  }

  const draft = loadDraft()

  const [notes, setNotes] = useState<string[]>(() => draft?.notes ?? parsedItems.map(() => ''))
  const [extras, setExtras] = useState<ExtraItem[]>(() => draft?.extras ?? [])
  const [editingNote, setEditingNote] = useState<number | null>(null)
  const [editingExtraNote, setEditingExtraNote] = useState<string | null>(null)
  const [newExtraText, setNewExtraText] = useState('')
  const newExtraRef = useRef<HTMLInputElement>(null)
  const [lastSavedAt] = useState<string | null>(draft?.updatedAt ?? null)

  const [savedRuns, setSavedRuns] = useState<ChecklistSnapshot[]>([])
  const [snapshotsLoading, setSnapshotsLoading] = useState(true)
  const [snapshotTitle, setSnapshotTitle] = useState('')
  const [viewingRunId, setViewingRunId] = useState<number | null>(null)
  const [showSavedList, setShowSavedList] = useState(false)
  const [confirmDeleteRunId, setConfirmDeleteRunId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  // Load snapshots from server
  useEffect(() => {
    let cancelled = false
    snapshotsApi.list(checklist.id)
      .then(({ snapshots }) => { if (!cancelled) setSavedRuns(snapshots) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setSnapshotsLoading(false) })
    return () => { cancelled = true }
  }, [checklist.id])

  // Persist draft to localStorage
  useEffect(() => {
    try {
      const hasAny = notes.some(n => n.trim() !== '') || extras.length > 0
      if (!hasAny) { localStorage.removeItem(draftKey); return }
      const payload: DraftRun = { notes, extras, itemsHash: hash, updatedAt: new Date().toISOString() }
      localStorage.setItem(draftKey, JSON.stringify(payload))
    } catch {}
  }, [notes, extras, draftKey, hash])

  const saveSnapshot = async () => {
    const title = snapshotTitle.trim() || `检查 - ${new Date().toLocaleString('zh-CN')}`
    setSaving(true)
    try {
      const data = {
        notes: [...notes],
        extras: extras.map(e => ({ ...e })),
      }
      const { snapshot } = await snapshotsApi.create(checklist.id, title, hash, data)
      setSavedRuns(prev => [snapshot, ...prev])
      setSnapshotTitle('')
      setShowSavedList(true)
    } catch (err: any) {
      alert('保存失败：' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const loadSnapshot = (run: ChecklistSnapshot) => {
    try {
      const data = JSON.parse(run.data)
      const loadedNotes: string[] = Array.isArray(data.notes) ? data.notes : []
      const filled: string[] = parsedItems.map((_, i) => loadedNotes[i] ?? '')
      setNotes(filled)
      setExtras((data.extras ?? []).map((e: any) => ({
        id: e.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text: String(e.text || ''),
        note: String(e.note || ''),
      })))
      setViewingRunId(run.id)
      setEditingNote(null)
      setEditingExtraNote(null)
    } catch (err: any) {
      alert('加载失败：' + err.message)
    }
  }

  const deleteSnapshot = async (id: number) => {
    try {
      await snapshotsApi.delete(id)
      setSavedRuns(prev => prev.filter(r => r.id !== id))
      if (viewingRunId === id) setViewingRunId(null)
    } catch (err: any) {
      alert('删除失败：' + err.message)
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
    try { localStorage.removeItem(draftKey) } catch {}
  }

  const addExtra = () => {
    const text = newExtraText.trim()
    if (!text) return
    setExtras(prev => [...prev, {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text,
      note: '',
    }])
    setNewExtraText('')
    setTimeout(() => newExtraRef.current?.focus(), 0)
  }

  const updateExtraNote = (id: string, note: string) => {
    setExtras(prev => prev.map(e => e.id === id ? { ...e, note } : e))
  }

  const removeExtra = (id: string) => {
    setExtras(prev => prev.filter(e => e.id !== id))
    if (editingExtraNote === id) setEditingExtraNote(null)
  }

  const updateNote = (idx: number, val: string) => {
    setNotes(prev => prev.map((v, i) => i === idx ? val : v))
  }

  // "Done" means the user wrote something for this item.
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
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
            <h2 className="font-mono text-xl font-medium text-[var(--color-ink)] mb-1">
              {checklist.title}
            </h2>
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

        <div
          className="w-full h-1.5 rounded-full mb-6 overflow-hidden"
          style={{ background: 'var(--color-border)' }}
        >
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${progress}%`,
              background: allDone ? '#22c55e' : 'var(--color-solid)',
            }}
          />
        </div>

        {/* Items */}
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
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      <span className="font-mono text-xs" style={{ color: 'var(--color-ink-faint)' }}>{idx + 1}</span>
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p
                      className="font-mono text-sm"
                      style={{ color: 'var(--color-ink)', wordBreak: 'break-word' }}
                    >
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
                {/* Editor / display for run-time note */}
                {editing ? (
                  <div className="pl-11 pr-3 pb-2.5" onClick={e => e.stopPropagation()}>
                    <AutoTextarea
                      value={notes[idx]}
                      onChange={e => updateNote(idx, (e.target as HTMLTextAreaElement).value)}
                      placeholder="输入备注... (Esc 收起)"
                      rows={2}
                      autoFocus
                      className="font-mono text-xs w-full px-2.5 py-1.5 bg-[var(--color-surface-strong)]"
                      style={{ border: '1px solid var(--color-border)', borderRadius: '6px', outline: 'none', color: 'var(--color-ink-secondary)', minHeight: '2.5rem' }}
                      onKeyDown={e => { if (e.key === 'Escape') setEditingNote(null) }}
                    />
                  </div>
                ) : notes[idx] ? (
                  <div
                    className="pl-11 pr-3 pb-2.5 cursor-pointer"
                    onClick={() => setEditingNote(idx)}
                  >
                    <p className="font-mono text-xs whitespace-pre-wrap" style={{ color: 'var(--color-ink-muted)', wordBreak: 'break-word' }}>
                      📝 {notes[idx]}
                    </p>
                  </div>
                ) : null}
              </div>
            )
          })}

          {/* Extras */}
          {extras.length > 0 && (
            <div className="pt-2 mt-2" style={{ borderTop: '1px dashed var(--color-border)' }}>
              <p className="font-mono text-xs px-3 py-1" style={{ color: 'var(--color-ink-faint)' }}>
                临时添加（{extras.length}）
              </p>
              {extras.map(extra => {
                const done = isExtraDone(extra)
                const editing = editingExtraNote === extra.id
                return (
                  <div key={extra.id} className="rounded-md transition-colors hover:bg-[var(--color-surface-hover)] group">
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
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        ) : '+'}
                      </span>
                      <span
                        className="font-mono text-sm flex-1"
                        style={{ color: 'var(--color-ink)', wordBreak: 'break-word' }}
                      >
                        {extra.text}
                      </span>
                      <button
                        onClick={e => { e.stopPropagation(); removeExtra(extra.id) }}
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
                          onChange={e => updateExtraNote(extra.id, (e.target as HTMLTextAreaElement).value)}
                          placeholder="输入备注..."
                          rows={2}
                          autoFocus
                          className="font-mono text-xs w-full px-2.5 py-1.5 bg-[var(--color-surface-strong)]"
                          style={{ border: '1px solid var(--color-border)', borderRadius: '6px', outline: 'none', color: 'var(--color-ink-secondary)', minHeight: '2.5rem' }}
                          onKeyDown={e => { if (e.key === 'Escape') setEditingExtraNote(null) }}
                        />
                      </div>
                    ) : extra.note ? (
                      <div
                        className="pl-11 pr-3 pb-2.5 cursor-pointer"
                        onClick={() => setEditingExtraNote(extra.id)}
                      >
                        <p className="font-mono text-xs whitespace-pre-wrap" style={{ color: 'var(--color-ink-muted)', wordBreak: 'break-word' }}>
                          📝 {extra.note}
                        </p>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}

          {/* Add extra */}
          <div className="pt-3 mt-2" style={{ borderTop: '1px dashed var(--color-border)' }}>
            <div className="flex items-center gap-2 px-3">
              <span className="font-mono text-sm shrink-0" style={{ color: 'var(--color-ink-faint)' }}>+</span>
              <input
                ref={newExtraRef}
                type="text"
                value={newExtraText}
                onChange={e => setNewExtraText(e.target.value)}
                onKeyDown={e => {
                  if (e.nativeEvent.isComposing || (e as any).keyCode === 229) return
                  if (e.key === 'Enter') { e.preventDefault(); addExtra() }
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
            <p className="font-mono text-sm" style={{ color: '#22c55e', fontWeight: 500 }}>所有项目均已填写完毕</p>
          </div>
        )}
      </div>

      {/* Save snapshot */}
      <div
        className="rounded-lg p-4 mt-4"
        style={{ background: 'var(--color-surface-strong)', border: '1px solid var(--color-border)', borderRadius: '8px' }}
      >
        <p className="font-mono text-xs mb-2" style={{ color: 'var(--color-ink-muted)' }}>
          {viewingRunId ? '📂 正在查看已保存的记录，可修改后另存一份' : '💾 保存当前进度为一份快照（云端保存）'}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            value={snapshotTitle}
            onChange={e => setSnapshotTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveSnapshot() } }}
            placeholder={`快照标题（默认：检查 - ${new Date().toLocaleString('zh-CN')}）`}
            className="font-mono text-sm flex-1 min-w-[200px] px-3 py-2 bg-[var(--color-surface-strong)]"
            style={{ border: '1px solid var(--color-border)', borderRadius: '6px', outline: 'none' }}
          />
          <button
            onClick={saveSnapshot}
            disabled={saving || (checkedCount === 0 && notes.every(n => n.trim() === ''))}
            className="font-mono text-sm px-4 py-2 rounded-md text-[var(--color-solid-text)] transition-colors disabled:opacity-50"
            style={{ background: 'var(--color-solid)', borderRadius: '6px' }}
          >
            {saving ? '保存中...' : '保存快照'}
          </button>
        </div>
      </div>

      {/* Saved snapshots */}
      {!snapshotsLoading && savedRuns.length > 0 && (
        <div
          className="rounded-lg mt-4"
          style={{ background: 'var(--color-surface-strong)', border: '1px solid var(--color-border)', borderRadius: '8px' }}
        >
          <button
            onClick={() => setShowSavedList(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 font-mono text-sm transition-colors hover:bg-[var(--color-surface-hover)]"
            style={{ color: 'var(--color-ink)', borderRadius: '8px' }}
          >
            <span>📚 已保存的快照 ({savedRuns.length})</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: showSavedList ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {showSavedList && (
            <div style={{ borderTop: '1px solid var(--color-border)' }}>
              {savedRuns.map(run => {
                let runNoteCount = 0
                let runTotal = parsedItems.length
                try {
                  const d = JSON.parse(run.data)
                  if (Array.isArray(d.notes)) runNoteCount += d.notes.filter((n: string) => n && n.trim() !== '').length
                  if (Array.isArray(d.extras)) {
                    runTotal += d.extras.length
                    runNoteCount += d.extras.filter((e: any) => e?.note && e.note.trim() !== '').length
                  }
                } catch {}
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
                        {isViewing && '👁 '}{run.title}
                        {!isMatch && <span className="ml-2 text-xs" style={{ color: 'var(--color-ink-faint)' }}>（清单已变更）</span>}
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
                    >
                      查看
                    </button>
                    {confirmDeleteRunId === run.id ? (
                      <>
                        <button
                          onClick={() => deleteSnapshot(run.id)}
                          className="font-mono text-xs px-2 py-1.5 rounded-md transition-colors"
                          style={{ background: 'var(--color-danger-text, #c00)', color: '#fff', borderRadius: '6px' }}
                        >
                          确认
                        </button>
                        <button
                          onClick={() => setConfirmDeleteRunId(null)}
                          className="font-mono text-xs px-2 py-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-strong)]"
                          style={{ color: 'var(--color-ink-muted)' }}
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

function LoadingScreen() {
  return (
    <main className="flex min-h-[60vh] items-center justify-center px-4">
      <p className="font-mono text-sm text-[var(--color-ink-muted)]">加载中...</p>
    </main>
  )
}
