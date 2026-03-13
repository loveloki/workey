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
          <p className="mb-1 font-mono text-sm uppercase tracking-[0.3em] text-[#333]">§ 待办</p>
          <h1
            className="text-3xl font-normal tracking-tight text-black sm:text-4xl"
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
      className="flex items-center gap-2 font-mono text-sm px-4 py-2 rounded-md transition-colors hover:bg-[#f0f0f0]"
      style={{ border: '1px solid #e5e5e5', borderRadius: '6px', color: '#666', textDecoration: 'none' }}
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
    } catch (err: any) {
      alert(err.message)
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
        style={{ background: 'var(--surface-strong)', border: '1px solid var(--line)', borderRadius: '8px' }}
      >
        <div className="flex flex-col gap-3">
          <div className="flex gap-3">
            <input
              ref={inputRef}
              type="text"
              value={newContent}
              onChange={e => setNewContent(e.target.value)}
              placeholder="输入待办内容..."
              className="font-mono text-sm flex-1 px-3 py-2 bg-white"
              style={{ border: '1px solid #e5e5e5', borderRadius: '6px', outline: 'none' }}
            />
            <button
              type="submit"
              disabled={adding || (!newContent.trim() && !newUrl.trim())}
              className="font-mono text-sm px-5 py-2 rounded-md text-white transition-colors disabled:opacity-50 shrink-0"
              style={{ background: '#000', borderRadius: '6px' }}
            >
              {adding ? '添加中...' : '+ 添加'}
            </button>
          </div>
          <input
            type="url"
            value={newUrl}
            onChange={e => setNewUrl(e.target.value)}
            placeholder="相关链接（可选）"
            className="font-mono text-sm px-3 py-2 bg-white"
            style={{ border: '1px solid #e5e5e5', borderRadius: '6px', outline: 'none' }}
          />
        </div>
      </form>

      {/* Filter toggle */}
      <div className="flex items-center gap-3 mb-4">
        <label className="flex items-center gap-2 font-mono text-xs cursor-pointer" style={{ color: '#666' }}>
          <input
            type="checkbox"
            checked={showAll}
            onChange={e => setShowAll(e.target.checked)}
            className="accent-black"
          />
          显示已完成
        </label>
        <span className="font-mono text-xs" style={{ color: '#999' }}>
          {items.length} 条待办
        </span>
      </div>

      {/* List */}
      {loading ? (
        <p className="font-mono text-sm text-center py-8" style={{ color: '#666' }}>加载中...</p>
      ) : items.length === 0 ? (
        <div
          className="rounded-lg py-12 text-center"
          style={{ border: '1px dashed var(--line)' }}
        >
          <p className="font-mono text-sm" style={{ color: '#999' }}>暂无待办事项</p>
          <p className="text-sm mt-1" style={{ fontFamily: 'Georgia, serif', color: '#bbb' }}>在上方输入内容快速添加</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(todo => (
            <TodoItem
              key={todo.id}
              todo={todo}
              onToggle={() => toggleDone(todo)}
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
  onDelete,
}: {
  todo: Todo
  onToggle: () => void
  onDelete: () => void
}) {
  return (
    <div
      className="flex items-start gap-3 rounded-lg px-4 py-3 group transition-colors"
      style={{
        background: 'var(--surface-strong)',
        border: '1px solid var(--line)',
        borderRadius: '8px',
        opacity: todo.done ? 0.6 : 1,
      }}
    >
      {/* Checkbox */}
      <button
        onClick={onToggle}
        className="mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors"
        style={{
          borderColor: todo.done ? '#000' : '#ccc',
          background: todo.done ? '#000' : 'transparent',
        }}
      >
        {todo.done && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p
          className="font-mono text-sm"
          style={{
            color: 'var(--sea-ink)',
            textDecoration: todo.done ? 'line-through' : 'none',
            wordBreak: 'break-word',
          }}
        >
          {todo.content || <span style={{ color: '#999' }}>(无内容)</span>}
        </p>
        {todo.url && (
          <a
            href={todo.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs mt-1 inline-block truncate max-w-full"
            style={{ color: '#666', textDecoration: 'underline', textUnderlineOffset: '2px' }}
          >
            {todo.url}
          </a>
        )}
      </div>

      {/* Delete */}
      <button
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 transition-opacity font-mono text-xs px-2 py-1 rounded hover:bg-red-50 shrink-0"
        style={{ color: '#c00' }}
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
      <p className="font-mono text-sm text-[#666]">加载中...</p>
    </main>
  )
}
