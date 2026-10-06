import { useNavigate } from '@tanstack/react-router'
import { useState, useRef, type FormEvent, type KeyboardEvent } from 'react'
import { type Todo, type RecordID } from '../../lib/api'
import { useToast } from '../../lib/toast-context'
import { useCreatedTodosToday, useCreateTodo, useUpdateTodo, useDeleteTodo } from '../../lib/queries'
import { useI18n } from '../../lib/i18n'

function useTodayCreatedTodos() {
  const { data, isLoading } = useCreatedTodosToday()
  const createMut = useCreateTodo()
  const updateMut = useUpdateTodo()
  const deleteMut = useDeleteTodo()

  const items = data?.todos ?? []

  const toggleDone = async (todo: Todo) => {
    await updateMut.mutateAsync({ id: todo.id, data: { done: !todo.done } })
  }

  const updateTodo = async (id: RecordID, d: { content?: string; url?: string }) => {
    await updateMut.mutateAsync({ id, data: d })
  }

  const deleteTodo = async (id: RecordID) => {
    await deleteMut.mutateAsync(id)
  }

  const addTodo = async (content: string, url: string) => {
    await createMut.mutateAsync({ content, url })
  }

  return { items, loading: isLoading, toggleDone, updateTodo, deleteTodo, addTodo }
}

function AddTodoForm({ onAdd }: { onAdd: (content: string, url: string) => Promise<void> }) {
  const { t } = useI18n()
  const [content, setContent] = useState('')
  const [url, setUrl] = useState('')
  const [showUrl, setShowUrl] = useState(false)
  const [adding, setAdding] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { toastError } = useToast()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!content.trim() && !url.trim()) return
    setAdding(true)
    try {
      await onAdd(content.trim(), url.trim())
      setContent('')
      setUrl('')
      setShowUrl(false)
      inputRef.current?.focus()
    } catch (e: unknown) {
      toastError(e instanceof Error ? e.message : t('common.operationFailed'))
    } finally {
      setAdding(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mb-3">
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder={t('todos.addPlaceholder')}
          className="font-mono text-sm flex-1 px-3 py-1.5 bg-[var(--color-surface-strong)] border border-[var(--color-border)] rounded-md outline-none"
        />
        <button
          type="button"
          onClick={() => setShowUrl(!showUrl)}
          className="font-mono text-xs px-2 py-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-hover)] shrink-0 border border-[var(--color-border)] text-[var(--color-ink-muted)]"
          title={t('todos.addLink')}
        >
          🔗
        </button>
        <button
          type="submit"
          disabled={adding || (!content.trim() && !url.trim())}
          className="font-mono text-xs px-3 py-1.5 rounded-md text-[var(--color-solid-text)] transition-colors disabled:opacity-50 shrink-0 bg-[var(--color-solid)]"
        >
          {adding ? '...' : '+'}
        </button>
      </div>
      {showUrl && (
        <input
          type="url"
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder={t('todos.relatedLinkOptional')}
          className="font-mono text-sm w-full mt-2 px-3 py-1.5 bg-[var(--color-surface-strong)] border border-[var(--color-border)] rounded-md outline-none"
        />
      )}
    </form>
  )
}

function TodoItemInteractive({
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
  const { t } = useI18n()
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

  const cancelEdit = () => setEditing(false)

  const { toastError } = useToast()

  const saveEdit = async () => {
    if (!editContent.trim() && !editUrl.trim()) return
    setSaving(true)
    try {
      await onUpdate({ content: editContent.trim(), url: editUrl.trim() })
      setEditing(false)
    } catch (e: unknown) {
      toastError(e instanceof Error ? e.message : t('common.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit() }
    else if (e.key === 'Escape') cancelEdit()
  }

  if (editing) {
    return (
      <div className="rounded-md px-3 py-2 border-2 border-[var(--color-ink)] bg-[var(--color-surface-strong)]">
        <input
          ref={contentRef}
          type="text"
          value={editContent}
          onChange={e => setEditContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('todos.contentPlaceholder')}
          className="font-mono text-sm w-full px-2 py-1 bg-[var(--color-surface-strong)] border border-[var(--color-border)] rounded outline-none"
        />
        <input
          type="url"
          value={editUrl}
          onChange={e => setEditUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('common.optionalLink')}
          className="font-mono text-sm w-full mt-1 px-2 py-1 bg-[var(--color-surface-strong)] border border-[var(--color-border)] rounded outline-none"
        />
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={saveEdit}
            disabled={saving}
            className="font-mono text-xs px-3 py-1 rounded text-[var(--color-solid-text)] disabled:opacity-50 bg-[var(--color-solid)]"
          >
            {saving ? '...' : t('common.save')}
          </button>
          <button
            onClick={cancelEdit}
            className="font-mono text-xs px-3 py-1 rounded hover:bg-[var(--color-surface-hover)] border border-[var(--color-border)] text-[var(--color-ink-muted)]"
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className={
        'flex items-start gap-2 rounded-md px-3 py-2 group transition-colors ' +
        (todo.done ? 'opacity-60' : 'opacity-100')
      }
    >
      {/* Checkbox */}
      <button
        onClick={onToggle}
        className={
          'mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ' +
          (todo.done
            ? 'border-[var(--color-solid)] bg-[var(--color-solid)]'
            : 'border-[var(--color-border-strong)] bg-transparent')
        }
      >
        {todo.done && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--color-solid-text)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0" onDoubleClick={startEdit}>
        <p
          className={
            'font-mono text-sm text-[var(--color-ink)] break-words ' +
            (todo.done ? 'line-through' : 'no-underline')
          }
        >
          {todo.content || <span className="text-[var(--color-ink-faint)]">{t('common.empty')}</span>}
        </p>
        {todo.url && (
          <a
            href={todo.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs mt-0.5 inline-block truncate max-w-full text-[var(--color-ink-muted)] underline underline-offset-2"
            onClick={e => e.stopPropagation()}
          >
            {todo.url}
          </a>
        )}
      </div>

      {/* Actions */}
      <button
        onClick={startEdit}
        className="opacity-0 group-hover:opacity-100 transition-opacity font-mono text-xs px-1 py-0.5 rounded hover:bg-[var(--color-surface-hover)] shrink-0 text-[var(--color-ink-muted)]"
        title={t('common.edit')}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      </button>
      <button
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 transition-opacity font-mono text-xs px-1 py-0.5 rounded hover:bg-[var(--color-danger-bg)] shrink-0 text-[var(--color-danger-text)]"
        title={t('common.delete')}
      >
        ✕
      </button>
    </div>
  )
}

export function TodayCreatedTodosSidebar() {
  const { t } = useI18n()
  const { items, loading, toggleDone, updateTodo, deleteTodo, addTodo } = useTodayCreatedTodos()
  const navigate = useNavigate()

  return (
    <div className="rounded-lg overflow-hidden sticky top-8 bg-[var(--color-surface-strong)] border border-[var(--color-border)]">
      <div className="flex items-center justify-between px-4 py-3">
        <p className="font-mono text-sm uppercase tracking-[0.3em] text-[var(--color-ink-secondary)]">
          {t('todos.todayHeading')}
        </p>
        <button
          onClick={() => navigate({ to: '/todos' })}
          className="font-mono text-xs px-2 py-1 rounded-md transition-colors hover:bg-[var(--color-surface-hover)] border border-[var(--color-border)] text-[var(--color-ink-muted)]"
        >
          {t('common.all')}
        </button>
      </div>
      <div className="border-t border-dashed border-t-[var(--color-border)]" />
      <div className="px-4 py-3">
        <AddTodoForm onAdd={addTodo} />
        {loading ? (
          <p className="text-sm text-[var(--color-ink-muted)] py-4 text-center font-serif">{t('common.loading')}</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-faint)] py-4 text-center font-serif">{t('todos.noneCreatedToday')}</p>
        ) : (
          <div className="space-y-1 max-h-[calc(100vh-16rem)] overflow-y-auto">
            {items.map(todo => (
              <TodoItemInteractive
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
    </div>
  )
}

export function TodayCreatedTodosInline() {
  const { t } = useI18n()
  const { items, loading, toggleDone, updateTodo, deleteTodo, addTodo } = useTodayCreatedTodos()
  const navigate = useNavigate()

  return (
    <div className="px-6 py-5">
      <div className="flex items-center justify-between mb-4">
        <p className="font-mono text-sm uppercase tracking-[0.3em] text-[var(--color-ink-secondary)]">
          {t('todos.todayHeading')}
        </p>
        <button
          onClick={() => navigate({ to: '/todos' })}
          className="font-mono text-xs px-3 py-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-hover)] border border-[var(--color-border)] text-[var(--color-ink-muted)]"
        >
          {t('common.all')}
        </button>
      </div>
      <AddTodoForm onAdd={addTodo} />
      {loading ? (
        <p className="text-sm text-[var(--color-ink-muted)] font-serif">{t('common.loading')}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-[var(--color-ink-faint)] font-serif">{t('todos.noneCreatedToday')}</p>
      ) : (
        <div className="space-y-1">
          {items.map(todo => (
            <TodoItemInteractive
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
