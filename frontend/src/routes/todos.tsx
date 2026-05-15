import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useAuth } from '../lib/auth-context'
import { useState, useEffect, useRef } from 'react'
import { todos as todosApi, settings, type Todo } from '../lib/api'

export const Route = createFileRoute('/todos')({ component: TodosPage })

function TodosPage() {
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: '/login' })
  }, [authLoading, user, navigate])

  if (authLoading) return <LoadingScreen />
  if (!user) return null

  return (
    <main className="max-w-5xl mx-auto px-4 pb-8 pt-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <p className="mb-1 font-mono text-sm uppercase tracking-[0.3em] text-[var(--color-ink-secondary)]">§ 待办</p>
          <h1
            className="text-3xl font-normal tracking-tight text-[var(--color-ink)] sm:text-4xl"
            style={{ fontFamily: 'Georgia, serif' }}
          >
            TODO 清单
          </h1>
        </div>
        <KanbanLink />
      </div>

      <TodoList />
    </main>
  )
}

/* ── Kanban external link ─────────────────────────────────── */

function KanbanLink() {
  const [url, setUrl] = useState('')

  useEffect(() => {
    settings.get().then(d => setUrl(d.kanban_url || 'https://www.fizzy.do/'))
  }, [])

  if (!url) return null

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 font-mono text-sm px-4 py-2 rounded-md transition-colors hover:bg-[var(--color-surface-hover)]"
      style={{ border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-ink-muted)', textDecoration: 'none' }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
      </svg>
      看板 ↗
    </a>
  )
}

/* ── Todo List ────────────────────────────────────────────── */

function TodoList() {
  const [items, setItems] = useState<Todo[]>([])
  const [loading, setLoading] = useState(true)
  const [showAll, setShowAll] = useState(false)
  const [newContent, setNewContent] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [adding, setAdding] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const load = () => {
    todosApi.list(showAll).then(d => {
      setItems(d.todos)
      setLoading(false)
    })
  }

  useEffect(() => { load() }, [showAll])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newContent.trim() && !newUrl.trim()) return
    setAdding(true)
    try {
      const { todo } = await todosApi.create(newContent.trim(), newUrl.trim())
      setItems(prev => [todo, ...prev])
      setNewContent('')
      setNewUrl('')
      inputRef.current?.focus()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : '添加失败')
    } finally {
      setAdding(false)
    }
  }

  const toggleDone = async (todo: Todo) => {
    const { todo: updated } = await todosApi.update(todo.id, { done: !todo.done })
    if (!showAll && updated.done) {
      setItems(prev => prev.filter(t => t.id !== todo.id))
    } else {
      setItems(prev => prev.map(t => t.id === todo.id ? updated : t))
    }
  }

  const updateTodo = async (id: number, data: { content?: string; url?: string }) => {
    const { todo: updated } = await todosApi.update(id, data)
    setItems(prev => prev.map(t => t.id === id ? updated : t))
  }

  const deleteTodo = async (id: number) => {
    await todosApi.delete(id)
    setItems(prev => prev.filter(t => t.id !== id))
  }

  return (
    <div>
      {/* Add form */}
      <form
        onSubmit={handleAdd}
        className="rounded-lg p-4 mb-4"
        style={{ background: 'var(--color-surface-strong)', border: '1px solid var(--color-border)', borderRadius: '8px' }}
      >
        <div className="flex flex-col gap-3">
          <div className="flex gap-3">
            <input
              ref={inputRef}
              type="text"
              value={newContent}
              onChange={e => setNewContent(e.target.value)}
              placeholder="输入待办内容..."
              className="font-mono text-sm flex-1 px-3 py-2 bg-[var(--color-surface-strong)]"
              style={{ border: '1px solid var(--color-border)', borderRadius: '6px', outline: 'none' }}
            />
            <button
              type="submit"
              disabled={adding || (!newContent.trim() && !newUrl.trim())}
              className="font-mono text-sm px-5 py-2 rounded-md text-[var(--color-solid-text)] transition-colors disabled:opacity-50 shrink-0"
              style={{ background: 'var(--color-solid)', borderRadius: '6px' }}
            >
              {adding ? '添加中...' : '+ 添加'}
            </button>
          </div>
          <input
            type="url"
            value={newUrl}
            onChange={e => setNewUrl(e.target.value)}
            placeholder="相关链接（可选）"
            className="font-mono text-sm px-3 py-2 bg-[var(--color-surface-strong)]"
            style={{ border: '1px solid var(--color-border)', borderRadius: '6px', outline: 'none' }}
          />
        </div>
      </form>

      {/* Filter toggle */}
      <div className="flex items-center gap-3 mb-4">
        <label className="flex items-center gap-2 font-mono text-xs cursor-pointer" style={{ color: 'var(--color-ink-muted)' }}>
          <input
            type="checkbox"
            checked={showAll}
            onChange={e => setShowAll(e.target.checked)}
            className="accent-[var(--color-ink)]"
          />
          显示已完成
        </label>
        <span className="font-mono text-xs" style={{ color: 'var(--color-ink-faint)' }}>
          {items.length} 条待办
        </span>
      </div>

      {/* List */}
      {loading ? (
        <p className="font-mono text-sm text-center py-8" style={{ color: 'var(--color-ink-muted)' }}>加载中...</p>
      ) : items.length === 0 ? (
        <div
          className="rounded-lg py-12 text-center"
          style={{ border: '1px dashed var(--color-border)' }}
        >
          <p className="font-mono text-sm" style={{ color: 'var(--color-ink-faint)' }}>暂无待办事项</p>
          <p className="text-sm mt-1" style={{ fontFamily: 'Georgia, serif', color: 'var(--color-ink-faint)' }}>在上方输入内容快速添加</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(todo => (
            <TodoItem
              key={todo.id}
              todo={todo}
              onToggle={() => toggleDone(todo)}
              onUpdate={(data) => updateTodo(todo.id, data)}
              onDelete={() => deleteTodo(todo.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Single Todo Item ─────────────────────────────────────── */

function TodoItem({
  todo,
  onToggle,
  onUpdate,
  onDelete,
}: {
  todo: Todo
  onToggle: () => void
  onUpdate: (data: { content?: string; url?: string }) => Promise<void>
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState(todo.content)
  const [editUrl, setEditUrl] = useState(todo.url)
  const [saving, setSaving] = useState(false)
  const contentRef = useRef<HTMLInputElement>(null)

  const startEdit = () => {
    setEditContent(todo.content)
    setEditUrl(todo.url)
    setEditing(true)
    setTimeout(() => contentRef.current?.focus(), 0)
  }

  const cancelEdit = () => {
    setEditing(false)
  }

  const saveEdit = async () => {
    if (!editContent.trim() && !editUrl.trim()) return
    setSaving(true)
    try {
      await onUpdate({ content: editContent.trim(), url: editUrl.trim() })
      setEditing(false)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      saveEdit()
    } else if (e.key === 'Escape') {
      cancelEdit()
    }
  }

  if (editing) {
    return (
      <div
        className="rounded-lg px-4 py-3"
        style={{
          background: 'var(--color-surface-strong)',
          border: '2px solid var(--color-ink)',
          borderRadius: '8px',
        }}
      >
        <div className="flex flex-col gap-2">
          <input
            ref={contentRef}
            type="text"
            value={editContent}
            onChange={e => setEditContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="待办内容..."
            className="font-mono text-sm w-full px-3 py-2 bg-[var(--color-surface-strong)]"
            style={{ border: '1px solid var(--color-border)', borderRadius: '6px', outline: 'none' }}
          />
          <input
            type="url"
            value={editUrl}
            onChange={e => setEditUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="相关链接（可选）"
            className="font-mono text-sm w-full px-3 py-2 bg-[var(--color-surface-strong)]"
            style={{ border: '1px solid var(--color-border)', borderRadius: '6px', outline: 'none' }}
          />
          <div className="flex items-center gap-2 mt-1">
            <button
              onClick={saveEdit}
              disabled={saving || (!editContent.trim() && !editUrl.trim())}
              className="font-mono text-xs px-4 py-1.5 rounded-md text-[var(--color-solid-text)] transition-colors disabled:opacity-50"
              style={{ background: 'var(--color-solid)', borderRadius: '6px' }}
            >
              {saving ? '保存中...' : '保存'}
            </button>
            <button
              onClick={cancelEdit}
              className="font-mono text-xs px-4 py-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-hover)]"
              style={{ border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-ink-muted)' }}
            >
              取消
            </button>
            <span className="font-mono text-xs" style={{ color: 'var(--color-ink-faint)' }}>Enter 保存 · Esc 取消</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="flex items-start gap-3 rounded-lg px-4 py-3 group transition-colors"
      style={{
        background: 'var(--color-surface-strong)',
        border: '1px solid var(--color-border)',
        borderRadius: '8px',
        opacity: todo.done ? 0.6 : 1,
      }}
    >
      {/* Checkbox */}
      <button
        onClick={onToggle}
        className="mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors"
        style={{
          borderColor: todo.done ? 'var(--color-solid)' : 'var(--color-border-strong)',
          background: todo.done ? 'var(--color-solid)' : 'transparent',
        }}
      >
        {todo.done && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-solid-text)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </button>

      {/* Content — double click to edit */}
      <div className="flex-1 min-w-0" onDoubleClick={startEdit}>
        <p
          className="font-mono text-sm"
          style={{
            color: 'var(--color-ink)',
            textDecoration: todo.done ? 'line-through' : 'none',
            wordBreak: 'break-word',
          }}
        >
          {todo.content || <span style={{ color: 'var(--color-ink-faint)' }}>(无内容)</span>}
        </p>
        {todo.url && (
          <a
            href={todo.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs mt-1 inline-block truncate max-w-full"
            style={{ color: 'var(--color-ink-muted)', textDecoration: 'underline', textUnderlineOffset: '2px' }}
            onClick={e => e.stopPropagation()}
          >
            {todo.url}
          </a>
        )}
      </div>

      {/* Edit */}
      <button
        onClick={startEdit}
        className="opacity-0 group-hover:opacity-100 transition-opacity font-mono text-xs px-2 py-1 rounded hover:bg-[var(--color-surface-hover)] shrink-0"
        style={{ color: 'var(--color-ink-muted)' }}
        title="编辑"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      </button>

      {/* Delete */}
      <button
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 transition-opacity font-mono text-xs px-2 py-1 rounded hover:bg-[var(--color-danger-bg)] shrink-0"
        style={{ color: 'var(--color-danger-text)' }}
        title="删除"
      >
        ✕
      </button>
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
