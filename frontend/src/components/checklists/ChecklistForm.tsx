import {
  useState,
  useEffect,
  useRef,
  type KeyboardEvent,
} from 'react'
import { type Checklist, type ChecklistItem } from '../../lib/api'
import { useToast } from '../../lib/toast-context'
import { useCreateChecklist } from '../../lib/queries'

export function ChecklistForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: { title: string; items: ChecklistItem[] }
  onSave: (cl: Checklist | Pick<Checklist, 'title' | 'items'>) => void
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
  const { toastError } = useToast()
  const createMut = useCreateChecklist()

  const reorder = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return
    setItems(prev => {
      const next = [...prev]
      const [m] = next.splice(from, 1)
      next.splice(to, 0, m)
      return next
    })
  }

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  const addItem = () => {
    setItems(prev => [...prev, { text: '' }])
    setTimeout(() => {
      itemRefs.current[items.length]?.focus()
    }, 0)
  }
  const removeItem = (idx: number) => {
    if (items.length <= 1) return
    setItems(prev => prev.filter((_, i) => i !== idx))
  }
  const updateText = (idx: number, val: string) => {
    setItems(prev => prev.map((it, i) => (i === idx ? { ...it, text: val } : it)))
  }
  const updateNote = (idx: number, val: string) => {
    setItems(prev => prev.map((it, i) => (i === idx ? { ...it, note: val } : it)))
  }

  const handleItemKeyDown = (e: KeyboardEvent<HTMLInputElement>, idx: number) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
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
        onSave({ title: title.trim(), items: JSON.stringify(filtered) })
      } else {
        const { checklist } = await createMut.mutateAsync({ title: title.trim(), items: filtered })
        onSave(checklist)
      }
    } catch (e: unknown) {
      toastError(e instanceof Error ? e.message : '操作失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-lg p-5 mb-6 bg-[var(--color-surface-strong)] border-2 border-[var(--color-ink)]">
      <input
        ref={titleRef}
        type="text"
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="清单标题，如：上线前检查、代码评审..."
        className="font-mono text-base w-full px-3 py-2 mb-4 bg-[var(--color-surface-strong)] border border-[var(--color-border)] rounded-md outline-none font-medium"
      />

      <p className="font-mono text-xs mb-2 text-[var(--color-ink-muted)]">
        检查项目：
      </p>

      <div className="space-y-2 mb-4">
        {items.map((it, idx) => {
          const isDragging = dragIdx === idx
          const isDragOver = dragOverIdx === idx && dragIdx !== null && dragIdx !== idx
          return (
            <div
              key={idx}
              className={[
                'flex items-start gap-2 transition-opacity duration-150',
                isDragging ? 'opacity-40' : 'opacity-100',
                'border-t-2',
                isDragOver && (dragIdx ?? -1) > idx ? 'border-t-[var(--color-solid)]' : 'border-t-transparent',
                'border-b-2',
                isDragOver && (dragIdx ?? -1) < idx ? 'border-b-[var(--color-solid)]' : 'border-b-transparent',
              ].join(' ')}
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
            >
              <button
                type="button"
                draggable
                onDragStart={e => {
                  setDragIdx(idx)
                  e.dataTransfer.effectAllowed = 'move'
                  try {
                    e.dataTransfer.setData('text/plain', String(idx))
                  } catch {
                    /* ignore */
                  }
                }}
                onDragEnd={() => {
                  setDragIdx(null)
                  setDragOverIdx(null)
                }}
                className="font-mono text-sm shrink-0 px-1 select-none transition-colors hover:text-[var(--color-ink)] mt-1.5 text-[var(--color-ink-faint)] cursor-grab touch-none"
                title="拖动调整顺序"
                aria-label="拖动手柄"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <circle cx="9" cy="5" r="1.6" />
                  <circle cx="15" cy="5" r="1.6" />
                  <circle cx="9" cy="12" r="1.6" />
                  <circle cx="15" cy="12" r="1.6" />
                  <circle cx="9" cy="19" r="1.6" />
                  <circle cx="15" cy="19" r="1.6" />
                </svg>
              </button>
              <span className="font-mono text-xs w-5 text-right shrink-0 mt-2 text-[var(--color-ink-faint)]">
                {idx + 1}.
              </span>
              <div className="flex-1 flex flex-col gap-1">
                <input
                  ref={el => {
                    itemRefs.current[idx] = el
                  }}
                  type="text"
                  value={it.text}
                  onChange={e => updateText(idx, e.target.value)}
                  onKeyDown={e => handleItemKeyDown(e, idx)}
                  placeholder="输入检查项..."
                  className="font-mono text-sm w-full px-3 py-1.5 bg-[var(--color-surface-strong)] border border-[var(--color-border)] rounded-md outline-none"
                />
                <input
                  type="text"
                  value={it.note || ''}
                  onChange={e => updateNote(idx, e.target.value)}
                  placeholder="备注（可选，将显示在标题下方）"
                  className="font-mono text-xs w-full px-3 py-1 bg-[var(--color-surface-strong)] border border-dashed border-[var(--color-border)] rounded-md outline-none text-[var(--color-ink-muted)]"
                />
              </div>
              <div className="flex flex-col gap-0.5">
                {items.length > 1 && idx > 0 && (
                  <button
                    type="button"
                    onClick={() => reorder(idx, idx - 1)}
                    className="font-mono text-xs w-6 h-6 rounded hover:bg-[var(--color-surface-hover)] shrink-0 transition-colors text-[var(--color-ink-faint)]"
                    title="上移"
                    aria-label="上移"
                  >
                    ↑
                  </button>
                )}
                {items.length > 1 && idx < items.length - 1 && (
                  <button
                    type="button"
                    onClick={() => reorder(idx, idx + 1)}
                    className="font-mono text-xs w-6 h-6 rounded hover:bg-[var(--color-surface-hover)] shrink-0 transition-colors text-[var(--color-ink-faint)]"
                    title="下移"
                    aria-label="下移"
                  >
                    ↓
                  </button>
                )}
              </div>
              {items.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeItem(idx)}
                  className="font-mono text-xs w-6 h-6 rounded hover:bg-[var(--color-danger-bg)] shrink-0 transition-colors mt-1 text-[var(--color-danger-text,#c00)]"
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
        className="font-mono text-xs px-3 py-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-hover)] mb-4 border border-dashed border-[var(--color-border)] text-[var(--color-ink-muted)]"
      >
        + 添加检查项
      </button>

      <div className="flex items-center gap-2 pt-2 border-t border-t-[var(--color-border)]">
        <button
          onClick={handleSave}
          disabled={saving || !title.trim() || items.every(t => !t.text.trim())}
          className="font-mono text-sm px-5 py-2 rounded-md text-[var(--color-solid-text)] transition-colors disabled:opacity-50 bg-[var(--color-solid)]"
        >
          {saving ? '保存中...' : '保存'}
        </button>
        <button
          onClick={onCancel}
          className="font-mono text-sm px-5 py-2 rounded-md transition-colors hover:bg-[var(--color-surface-hover)] border border-[var(--color-border)] text-[var(--color-ink-muted)]"
        >
          取消
        </button>
        <span className="font-mono text-xs text-[var(--color-ink-faint)]">
          Enter 添加新项 · 拖动⋮⋮ 或 ↑↓ 调整顺序
        </span>
      </div>
    </div>
  )
}
