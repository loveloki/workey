import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useAuth } from '../lib/auth-context'
import { useState, useEffect, useRef } from 'react'
import { checklists as checklistsApi, type Checklist } from '../lib/api'

export const Route = createFileRoute('/checklists')({ component: ChecklistsPage })

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

  // If using a checklist, show the "use" view
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
      {/* Create button */}
      {!showCreate && (
        <button
          onClick={() => setShowCreate(true)}
          className="font-mono text-sm px-5 py-2.5 rounded-md text-[var(--color-solid-text)] transition-colors mb-6"
          style={{ background: 'var(--color-solid)', borderRadius: '6px' }}
        >
          + 新建清单
        </button>
      )}

      {/* Create form */}
      {showCreate && (
        <ChecklistForm
          onSave={handleCreated}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {/* List */}
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
  initial?: { title: string; items: string[] }
  onSave: (cl: Checklist) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState(initial?.title || '')
  const [itemTexts, setItemTexts] = useState<string[]>(initial?.items?.length ? initial.items : [''])
  const [saving, setSaving] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)
  const itemRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  const addItem = () => {
    setItemTexts(prev => [...prev, ''])
    setTimeout(() => {
      itemRefs.current[itemTexts.length]?.focus()
    }, 0)
  }

  const removeItem = (idx: number) => {
    if (itemTexts.length <= 1) return
    setItemTexts(prev => prev.filter((_, i) => i !== idx))
  }

  const updateItem = (idx: number, val: string) => {
    setItemTexts(prev => prev.map((v, i) => i === idx ? val : v))
  }

  const handleItemKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, idx: number) => {
    // Skip during IME composition (e.g., Chinese pinyin input)
    if (e.nativeEvent.isComposing || (e as any).keyCode === 229) return
    if (e.key === 'Enter') {
      e.preventDefault()
      addItem()
    } else if (e.key === 'Backspace' && itemTexts[idx] === '' && itemTexts.length > 1) {
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
    const filteredItems = itemTexts.filter(t => t.trim() !== '')
    if (filteredItems.length === 0) return
    setSaving(true)
    try {
      if (initial) {
        // This is edit mode - caller handles the update call
        onSave({ title: title.trim(), items: JSON.stringify(filteredItems) } as any)
      } else {
        const { checklist } = await checklistsApi.create(title.trim(), filteredItems)
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
        {itemTexts.map((text, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <span className="font-mono text-xs w-5 text-right shrink-0" style={{ color: 'var(--color-ink-faint)' }}>
              {idx + 1}.
            </span>
            <input
              ref={el => { itemRefs.current[idx] = el }}
              type="text"
              value={text}
              onChange={e => updateItem(idx, e.target.value)}
              onKeyDown={e => handleItemKeyDown(e, idx)}
              placeholder="输入检查项..."
              className="font-mono text-sm flex-1 px-3 py-1.5 bg-[var(--color-surface-strong)]"
              style={{ border: '1px solid var(--color-border)', borderRadius: '6px', outline: 'none' }}
            />
            {itemTexts.length > 1 && (
              <button
                onClick={() => removeItem(idx)}
                className="font-mono text-xs px-2 py-1 rounded hover:bg-[var(--color-danger-bg)] shrink-0 transition-colors"
                style={{ color: 'var(--color-danger-text, #c00)' }}
              >
                ✕
              </button>
            )}
          </div>
        ))}
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
          disabled={saving || !title.trim() || itemTexts.every(t => !t.trim())}
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
          Enter 添加新项
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

  const parsedItems: string[] = (() => {
    try { return JSON.parse(checklist.items) } catch { return [] }
  })()

  const handleEditSave = async (data: any) => {
    try {
      const items = JSON.parse(data.items)
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
      {/* Title */}
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

      {/* Preview items */}
      <div className="flex-1 mb-3">
        <ul className="space-y-1">
          {parsedItems.slice(0, 4).map((item, idx) => (
            <li key={idx} className="font-mono text-xs flex items-start gap-2" style={{ color: 'var(--color-ink-muted)' }}>
              <span className="shrink-0 mt-0.5" style={{ color: 'var(--color-border-strong, var(--color-border))' }}>☐</span>
              <span className="line-clamp-1">{item}</span>
            </li>
          ))}
          {parsedItems.length > 4 && (
            <li className="font-mono text-xs" style={{ color: 'var(--color-ink-faint)' }}>
              ... 还有 {parsedItems.length - 4} 项
            </li>
          )}
        </ul>
      </div>

      {/* Actions */}
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

/* ── Checklist Use (临时打勾) ──────────────────────────────── */

function ChecklistUse({
  checklist,
  onBack,
}: {
  checklist: Checklist
  onBack: () => void
}) {
  const parsedItems: string[] = (() => {
    try { return JSON.parse(checklist.items) } catch { return [] }
  })()

  const storageKey = `checklist-run:${checklist.id}`

  type CachedRun = { checked: boolean[]; notes: string[]; itemsHash: string; updatedAt: string }
  const itemsHash = JSON.stringify(parsedItems)

  const loadCache = (): CachedRun | null => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) return null
      const parsed = JSON.parse(raw) as CachedRun
      if (parsed.itemsHash !== itemsHash) return null
      if (!Array.isArray(parsed.checked) || parsed.checked.length !== parsedItems.length) return null
      if (!Array.isArray(parsed.notes) || parsed.notes.length !== parsedItems.length) return null
      return parsed
    } catch { return null }
  }

  const cached = loadCache()

  const [checked, setChecked] = useState<boolean[]>(() => cached?.checked ?? parsedItems.map(() => false))
  const [notes, setNotes] = useState<string[]>(() => cached?.notes ?? parsedItems.map(() => ''))
  const [editingNote, setEditingNote] = useState<number | null>(null)
  const [lastSavedAt] = useState<string | null>(cached?.updatedAt ?? null)

  // Persist progress to localStorage
  useEffect(() => {
    try {
      const hasAny = checked.some(Boolean) || notes.some(n => n.trim() !== '')
      if (!hasAny) {
        localStorage.removeItem(storageKey)
        return
      }
      const payload: CachedRun = {
        checked,
        notes,
        itemsHash,
        updatedAt: new Date().toISOString(),
      }
      localStorage.setItem(storageKey, JSON.stringify(payload))
    } catch { /* quota or unavailable — ignore */ }
  }, [checked, notes, storageKey, itemsHash])

  const toggle = (idx: number) => {
    setChecked(prev => prev.map((v, i) => i === idx ? !v : v))
  }

  const updateNote = (idx: number, val: string) => {
    setNotes(prev => prev.map((v, i) => i === idx ? val : v))
  }

  const checkedCount = checked.filter(Boolean).length
  const totalCount = parsedItems.length
  const allDone = checkedCount === totalCount && totalCount > 0
  const progress = totalCount > 0 ? (checkedCount / totalCount) * 100 : 0

  return (
    <div>
      {/* Header */}
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
              {checkedCount} / {totalCount} 项已完成
              {allDone && ' ✅ 全部完成！'}
            </p>
          </div>
          {checkedCount > 0 && !allDone && (
            <button
              onClick={() => {
                setChecked(parsedItems.map(() => false))
                setNotes(parsedItems.map(() => ''))
                setEditingNote(null)
                try { localStorage.removeItem(storageKey) } catch {}
              }}
              className="font-mono text-xs px-3 py-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-hover)]"
              style={{ border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-ink-muted)' }}
            >
              重置
            </button>
          )}
        </div>

        {/* Progress bar */}
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
          {parsedItems.map((item, idx) => (
            <div key={idx} className="rounded-md transition-colors hover:bg-[var(--color-surface-hover)]" style={{ opacity: checked[idx] ? 0.6 : 1 }}>
              <div className="flex items-start gap-3 px-3 py-2.5 cursor-pointer">
                <button
                  onClick={() => toggle(idx)}
                  className="mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors"
                  style={{
                    borderColor: checked[idx] ? '#22c55e' : 'var(--color-border-strong, var(--color-border))',
                    background: checked[idx] ? '#22c55e' : 'transparent',
                  }}
                >
                  {checked[idx] && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
                <span
                  className="font-mono text-sm flex-1"
                  style={{
                    color: 'var(--color-ink)',
                    textDecoration: checked[idx] ? 'line-through' : 'none',
                    wordBreak: 'break-word',
                  }}
                  onClick={() => toggle(idx)}
                >
                  {item}
                </span>
                <button
                  onClick={() => setEditingNote(editingNote === idx ? null : idx)}
                  className="shrink-0 font-mono text-xs px-1.5 py-0.5 rounded transition-colors hover:bg-[var(--color-surface-hover)]"
                  style={{ color: notes[idx] ? 'var(--color-ink)' : 'var(--color-ink-faint)' }}
                  title="添加备注"
                >
                  {notes[idx] ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 20h9" /><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 20h9" /><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z" />
                    </svg>
                  )}
                </button>
              </div>
              {/* Note area */}
              {editingNote === idx && (
                <div className="pl-11 pr-3 pb-2.5">
                  <textarea
                    value={notes[idx]}
                    onChange={e => updateNote(idx, e.target.value)}
                    placeholder="输入备注..."
                    rows={2}
                    autoFocus
                    className="font-mono text-xs w-full px-2.5 py-1.5 bg-[var(--color-surface-strong)] resize-none"
                    style={{ border: '1px solid var(--color-border)', borderRadius: '6px', outline: 'none', color: 'var(--color-ink-secondary)' }}
                    onKeyDown={e => { if (e.key === 'Escape') setEditingNote(null) }}
                  />
                </div>
              )}
              {editingNote !== idx && notes[idx] && (
                <div
                  className="pl-11 pr-3 pb-2.5 cursor-pointer"
                  onClick={() => setEditingNote(idx)}
                >
                  <p className="font-mono text-xs whitespace-pre-wrap" style={{ color: 'var(--color-ink-muted)', wordBreak: 'break-word' }}>
                    📝 {notes[idx]}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* All done celebration */}
        {allDone && (
          <div className="mt-6 pt-4 text-center" style={{ borderTop: '1px solid var(--color-border)' }}>
            <p className="text-2xl mb-1">🎉</p>
            <p className="font-mono text-sm" style={{ color: '#22c55e', fontWeight: 500 }}>所有项目均已检查完毕</p>
          </div>
        )}
      </div>

      {/* Local cache reminder */}
      <p className="font-mono text-xs text-center mt-4" style={{ color: 'var(--color-ink-faint)' }}>
        {lastSavedAt
          ? `💾 已恢复上次进度 (${new Date(lastSavedAt).toLocaleString('zh-CN')})、仅本设备本地保存`
          : '💾 进度仅保存在本设备本地，方便下次回顾'}
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
