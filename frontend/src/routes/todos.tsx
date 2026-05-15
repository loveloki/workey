import { createFileRoute } from '@tanstack/react-router'
import { useAuthGuard } from '../lib/useAuthGuard'
import { useToast } from '../lib/toast-context'
import { useState, useRef } from 'react'
import { type Todo } from '../lib/api'
import { LoadingScreen } from '../components/LoadingScreen'
import { useSettings, useTodoList, useCreateTodo, useUpdateTodo, useDeleteTodo } from '../lib/queries'

export const Route = createFileRoute('/todos')({ component: TodosPage })

function TodosPage() {
  const { user, loading } = useAuthGuard()

  if (loading) return <LoadingScreen />
  if (!user) return null

  return (
    <main className="max-w-5xl mx-auto px-4 pb-8 pt-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <p className="mb-1 font-mono text-sm uppercase tracking-[0.3em] text-[var(--color-ink-secondary)]">§ 待办</p>
          <h1
            className="font-serif text-3xl font-normal tracking-tight text-[var(--color-ink)] sm:text-4xl"
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
  const { data } = useSettings()
  const url = data?.kanban_url || 'https://www.fizzy.do/'

  if (!data) return null

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 rounded-md border border-[var(--color-border)] px-4 py-2 font-mono text-sm text-[var(--color-ink-muted)] no-underline transition-colors hover:bg-[var(--color-surface-hover)]"
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
  const [showAll, setShowAll] = useState(false)
  const [newContent, setNewContent] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const { toastError } = useToast()

  const { data, isLoading } = useTodoList(showAll)
  const createMut = useCreateTodo()
  const updateMut = useUpdateTodo()
  const deleteMut = useDeleteTodo()

  const items = data?.todos ?? []

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newContent.trim() && !newUrl.trim()) return
    try {
      await createMut.mutateAsync({ content: newContent.trim(), url: newUrl.trim() })
      setNewContent('')
      setNewUrl('')
      inputRef.current?.focus()
    } catch (e: unknown) {
      toastError(e instanceof Error ? e.message : '添加失败')
    }
  }

  const toggleDone = async (todo: Todo) => {
    await updateMut.mutateAsync({ id: todo.id, data: { done: !todo.done } })
  }

  const updateTodo = async (id: number, d: { content?: string; url?: string }) => {
    await updateMut.mutateAsync({ id, data: d })
  }

  const deleteTodo = async (id: number) => {
    await deleteMut.mutateAsync(id)
  }

  return (
    <div>
      {/* Add form */}
      <form
        onSubmit={handleAdd}
        className="mb-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-4"
      >
        <div className="flex flex-col gap-3">
          <div className="flex gap-3">
            <input
              ref={inputRef}
              type="text"
              value={newContent}
              onChange={e => setNewContent(e.target.value)}
              placeholder="输入待办内容..."
              className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-strong)] px-3 py-2 font-mono text-sm outline-none"
            />
            <button
              type="submit"
              disabled={createMut.isPending || (!newContent.trim() && !newUrl.trim())}
              className="shrink-0 rounded-md bg-[var(--color-solid)] px-5 py-2 font-mono text-sm text-[var(--color-solid-text)] transition-colors disabled:opacity-50"
            >
              {createMut.isPending ? '添加中...' : '+ 添加'}
            </button>
          </div>
          <input
            type="url"
            value={newUrl}
            onChange={e => setNewUrl(e.target.value)}
            placeholder="相关链接（可选）"
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-strong)] px-3 py-2 font-mono text-sm outline-none"
          />
        </div>
      </form>

      {/* Filter toggle */}
      <div className="flex items-center gap-3 mb-4">
        <label className="flex cursor-pointer items-center gap-2 font-mono text-xs text-[var(--color-ink-muted)]">
          <input
            type="checkbox"
            checked={showAll}
            onChange={e => setShowAll(e.target.checked)}
            className="accent-[var(--color-ink)]"
          />
          显示已完成
        </label>
        <span className="font-mono text-xs text-[var(--color-ink-faint)]">
          {items.length} 条待办
        </span>
      </div>

      {/* List */}
      {isLoading ? (
        <p className="py-8 text-center font-mono text-sm text-[var(--color-ink-muted)]">加载中...</p>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--color-border)] py-12 text-center">
          <p className="font-mono text-sm text-[var(--color-ink-faint)]">暂无待办事项</p>
          <p className="mt-1 font-serif text-sm text-[var(--color-ink-faint)]">在上方输入内容快速添加</p>
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
  const { toastError } = useToast()

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
      toastError(e instanceof Error ? e.message : '保存失败')
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
      <div className="rounded-lg border-2 border-[var(--color-ink)] bg-[var(--color-surface-strong)] px-4 py-3">
        <div className="flex flex-col gap-2">
          <input
            ref={contentRef}
            type="text"
            value={editContent}
            onChange={e => setEditContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="待办内容..."
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-strong)] px-3 py-2 font-mono text-sm outline-none"
          />
          <input
            type="url"
            value={editUrl}
            onChange={e => setEditUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="相关链接（可选）"
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-strong)] px-3 py-2 font-mono text-sm outline-none"
          />
          <div className="flex items-center gap-2 mt-1">
            <button
              onClick={saveEdit}
              disabled={saving || (!editContent.trim() && !editUrl.trim())}
              className="rounded-md bg-[var(--color-solid)] px-4 py-1.5 font-mono text-xs text-[var(--color-solid-text)] transition-colors disabled:opacity-50"
            >
              {saving ? '保存中...' : '保存'}
            </button>
            <button
              onClick={cancelEdit}
              className="rounded-md border border-[var(--color-border)] px-4 py-1.5 font-mono text-xs text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-surface-hover)]"
            >
              取消
            </button>
            <span className="font-mono text-xs text-[var(--color-ink-faint)]">Enter 保存 · Esc 取消</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`group flex items-start gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-strong)] px-4 py-3 transition-colors ${todo.done ? 'opacity-60' : 'opacity-100'}`}
    >
      {/* Checkbox */}
      <button
        onClick={onToggle}
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${todo.done ? 'border-[var(--color-solid)] bg-[var(--color-solid)]' : 'border-[var(--color-border-strong)] bg-transparent'}`}
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
          className={`font-mono text-sm break-words text-[var(--color-ink)] ${todo.done ? 'line-through' : ''}`}
        >
          {todo.content || <span className="text-[var(--color-ink-faint)]">(无内容)</span>}
        </p>
        {todo.url && (
          <a
            href={todo.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block max-w-full truncate font-mono text-xs text-[var(--color-ink-muted)] underline underline-offset-2"
            onClick={e => e.stopPropagation()}
          >
            {todo.url}
          </a>
        )}
      </div>

      {/* Edit */}
      <button
        onClick={startEdit}
        className="shrink-0 rounded px-2 py-1 font-mono text-xs text-[var(--color-ink-muted)] opacity-0 transition-opacity hover:bg-[var(--color-surface-hover)] group-hover:opacity-100"
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
        className="shrink-0 rounded px-2 py-1 font-mono text-xs text-[var(--color-danger-text)] opacity-0 transition-opacity hover:bg-[var(--color-danger-bg)] group-hover:opacity-100"
        title="删除"
      >
        ✕
      </button>
    </div>
  )
}

