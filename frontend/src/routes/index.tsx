import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useAuth } from '../lib/auth-context'
import { useState, useEffect, useCallback, useRef } from 'react'
import { attendance, workLogs, todos as todosApi, type Todo } from '../lib/api'
import { formatTime, getToday } from '../lib/date-utils'
import { MarkdownEditor } from '../lib/markdown-editor'
import { formatDayMarkdown } from '../lib/report-utils'

export const Route = createFileRoute('/')({ component: Dashboard })

function CopyButton({ getText, className = '' }: { getText: () => Promise<string> | string; className?: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    const text = await getText()
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={handleCopy}
      className={`font-mono text-xs px-3 py-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-hover)] ${className}`}
      style={{ border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-ink-muted)' }}
      title="复制为 Markdown"
    >
      {copied ? '✓ 已复制' : (
        <span className="flex items-center gap-1">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          复制
        </span>
      )}
    </button>
  )
}

function Dashboard() {
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [todayData, setTodayData] = useState<any>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: '/login' })
  }, [authLoading, user, navigate])

  // Check if clocked in today
  useEffect(() => {
    if (!user) return
    attendance.today()
      .then(d => {
        if (!d.attendance?.clock_in && d.attendance?.status !== 'leave') {
          navigate({ to: '/clock' })
        } else {
          setTodayData(d.attendance)
          setChecking(false)
        }
      })
      .catch(() => setChecking(false))
  }, [user, navigate])

  const copyTodayReport = useCallback(async () => {
    const today = getToday()
    const [attRes, logRes, todosRes] = await Promise.all([
      attendance.today(),
      workLogs.today(),
      todosApi.completedToday(),
    ])
    return formatDayMarkdown(
      today,
      attRes.attendance,
      logRes.work_log?.content || '',
      todosRes.todos || [],
    )
  }, [])

  if (authLoading || checking) return <LoadingScreen />
  if (!user) return null

  return (
    <main className="max-w-7xl mx-auto px-4 pb-8 pt-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <p className="mb-1 font-mono text-sm uppercase tracking-[0.3em] text-[var(--color-ink-secondary)]">今日工作</p>
          <h1
            className="text-3xl font-normal tracking-tight text-[var(--color-ink)] sm:text-4xl"
            style={{ fontFamily: 'Georgia, serif' }}
          >
            {new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}
          </h1>
        </div>
        <CopyButton getText={copyTodayReport} className="mt-2" />
      </div>

      {/* Desktop: two-column layout */}
      <div className="hidden md:flex gap-6 items-start">
        {/* Left: Daily report card */}
        <div
          className="flex-1 min-w-0 rounded-lg overflow-hidden"
          style={{ background: 'var(--color-surface-strong)', border: '1px solid var(--color-border)' }}
        >
          {todayData && (
            <div className="flex items-center gap-6 px-6 py-4">
              <div className="flex items-center gap-2">
                {todayData?.is_overtime && <span className="bg-red-100 text-red-600 px-1.5 py-0.5 rounded text-[10px] font-bold">加班</span>}
                {todayData.status === 'leave' ? (
                  <span className="font-mono text-sm font-bold" style={{ color: 'var(--color-danger-text, #dc2626)' }}>已请假</span>
                ) : (
                  <>
                    <span className="font-mono text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">上班</span>
                    <span className="font-mono text-sm font-bold text-[var(--color-ink)]">{formatTime(todayData.clock_in)}</span>
                  </>
                )}
              </div>
              {todayData.status !== 'leave' && (
                <>
                  <div className="h-4 w-px" style={{ background: 'var(--color-border)' }} />
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">下班</span>
                    <span className="font-mono text-sm font-bold text-[var(--color-ink)]">{formatTime(todayData.clock_out)}</span>
                  </div>
                </>
              )}
              <div className="flex-1" />
              <button
                onClick={() => navigate({ to: '/clock' })}
                className="font-mono text-xs px-3 py-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-hover)]"
                style={{ border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-ink-muted)' }}
              >
                打卡 →
              </button>
            </div>
          )}
          <div style={{ borderTop: '1px dashed var(--color-border)' }} />
          <WorkLogSection />
          <div style={{ borderTop: '1px dashed var(--color-border)' }} />
          <CompletedTodosSection />
        </div>

        {/* Right: Today's created todos sidebar */}
        <div className="w-80 shrink-0 lg:w-96">
          <TodayCreatedTodosSidebar />
        </div>
      </div>

      {/* Mobile: single-column layout */}
      <div className="md:hidden">
        <div
          className="rounded-lg overflow-hidden"
          style={{ background: 'var(--color-surface-strong)', border: '1px solid var(--color-border)' }}
        >
          {todayData && (
            <div className="flex items-center gap-6 px-6 py-4">
              <div className="flex items-center gap-2">
                {todayData?.is_overtime && <span className="bg-red-100 text-red-600 px-1.5 py-0.5 rounded text-[10px] font-bold">加班</span>}
                {todayData.status === 'leave' ? (
                  <span className="font-mono text-sm font-bold" style={{ color: 'var(--color-danger-text, #dc2626)' }}>已请假</span>
                ) : (
                  <>
                    <span className="font-mono text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">上班</span>
                    <span className="font-mono text-sm font-bold text-[var(--color-ink)]">{formatTime(todayData.clock_in)}</span>
                  </>
                )}
              </div>
              {todayData.status !== 'leave' && (
                <>
                  <div className="h-4 w-px" style={{ background: 'var(--color-border)' }} />
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">下班</span>
                    <span className="font-mono text-sm font-bold text-[var(--color-ink)]">{formatTime(todayData.clock_out)}</span>
                  </div>
                </>
              )}
              <div className="flex-1" />
              <button
                onClick={() => navigate({ to: '/clock' })}
                className="font-mono text-xs px-3 py-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-hover)]"
                style={{ border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-ink-muted)' }}
              >
                打卡 →
              </button>
            </div>
          )}

          {/* Today's created todos — above work content on mobile */}
          <div style={{ borderTop: '1px dashed var(--color-border)' }} />
          <TodayCreatedTodosInline />

          <div style={{ borderTop: '1px dashed var(--color-border)' }} />
          <WorkLogSection />
          <div style={{ borderTop: '1px dashed var(--color-border)' }} />
          <CompletedTodosSection />
        </div>
      </div>
    </main>
  )
}

function WorkLogSection() {
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    workLogs.today().then(d => {
      if (d.work_log) setContent((d.work_log.content || '').replace(/^\s+/, ''))
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      await workLogs.save(getToday(), content)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e: any) {
      alert(e.message)
    }
    setSaving(false)
  }

  return (
    <div className="px-6 py-5">
      <p className="mb-4 font-mono text-sm uppercase tracking-[0.3em] text-[var(--color-ink-secondary)]">§ 工作内容 §</p>

      {loading ? (
        <p className="text-sm text-[var(--color-ink-muted)]" style={{ fontFamily: 'Georgia, serif' }}>加载中...</p>
      ) : (
        <>
          <div className="mb-4">
            <MarkdownEditor
              value={content}
              onChange={setContent}
              placeholder="记录今天的工作内容..."
              rows={10}
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={save}
              disabled={saving}
              className="rounded-md px-5 py-2.5 font-mono text-sm hover:bg-[var(--color-solid-hover)] disabled:opacity-50"
              style={{ background: 'var(--color-solid)', color: 'var(--color-solid-text)' }}
            >
              {saving ? '保存中...' : '保存'}
            </button>
            {saved && <span className="text-sm" style={{ fontFamily: 'Georgia, serif', color: 'var(--color-ink-muted)' }}>✓ 已保存</span>}
          </div>
        </>
      )}
    </div>
  )
}

function CompletedTodosSection() {
  const [items, setItems] = useState<Todo[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    todosApi.completedToday()
      .then(d => setItems(d.todos || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Poll every 30s to sync completed todos
  useEffect(() => {
    const timer = setInterval(() => {
      todosApi.completedToday()
        .then(d => setItems(d.todos || []))
        .catch(() => {})
    }, 30000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="px-6 py-5">
      <div className="flex items-center justify-between mb-4">
        <p className="font-mono text-sm uppercase tracking-[0.3em] text-[var(--color-ink-secondary)]">§ 已完成待办 §</p>
        <button
          onClick={() => navigate({ to: '/todos' })}
          className="font-mono text-xs px-3 py-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-hover)]"
          style={{ border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-ink-muted)' }}
        >
          查看全部 →
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--color-ink-muted)]" style={{ fontFamily: 'Georgia, serif' }}>加载中...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-[var(--color-ink-faint)]" style={{ fontFamily: 'Georgia, serif' }}>今天还没有完成的待办事项</p>
      ) : (
        <div className="space-y-1">
          {items.map(todo => (
            <div
              key={todo.id}
              className="flex items-start gap-3 px-2 py-2"
            >
              {/* Checkmark icon */}
              <div
                className="w-4 h-4 mt-0.5 rounded flex items-center justify-center shrink-0"
                style={{ background: 'var(--color-solid)' }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--color-solid-text)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p
                  className="text-sm"
                  style={{ color: 'var(--color-ink-muted)', fontFamily: 'Georgia, serif', wordBreak: 'break-word' }}
                >
                  {todo.content || <span style={{ color: 'var(--color-ink-faint)' }}>(无内容)</span>}
                </p>
                {todo.url && (
                  <a
                    href={todo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs mt-0.5 inline-block truncate max-w-full"
                    style={{ color: 'var(--color-ink-faint)', textDecoration: 'underline', textUnderlineOffset: '2px' }}
                    onClick={e => e.stopPropagation()}
                  >
                    {todo.url}
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Today's Created Todos (shared logic) ─────────────────── */

function useTodayCreatedTodos() {
  const [items, setItems] = useState<Todo[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    todosApi.createdToday()
      .then(d => setItems(d.todos || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  // Poll every 30s
  useEffect(() => {
    const timer = setInterval(() => {
      todosApi.createdToday()
        .then(d => setItems(d.todos || []))
        .catch(() => {})
    }, 30000)
    return () => clearInterval(timer)
  }, [])

  const toggleDone = async (todo: Todo) => {
    const { todo: updated } = await todosApi.update(todo.id, { done: !todo.done })
    setItems(prev => prev.map(t => t.id === todo.id ? updated : t))
  }

  const updateTodo = async (id: number, data: { content?: string; url?: string }) => {
    const { todo: updated } = await todosApi.update(id, data)
    setItems(prev => prev.map(t => t.id === id ? updated : t))
  }

  const deleteTodo = async (id: number) => {
    await todosApi.delete(id)
    setItems(prev => prev.filter(t => t.id !== id))
  }

  const addTodo = async (content: string, url: string) => {
    const { todo } = await todosApi.create(content, url)
    setItems(prev => [todo, ...prev])
  }

  return { items, loading, toggleDone, updateTodo, deleteTodo, addTodo }
}

/* ── Add Todo Form ────────────────────────────────────────── */

function AddTodoForm({ onAdd }: { onAdd: (content: string, url: string) => Promise<void> }) {
  const [content, setContent] = useState('')
  const [url, setUrl] = useState('')
  const [showUrl, setShowUrl] = useState(false)
  const [adding, setAdding] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!content.trim() && !url.trim()) return
    setAdding(true)
    try {
      await onAdd(content.trim(), url.trim())
      setContent('')
      setUrl('')
      setShowUrl(false)
      inputRef.current?.focus()
    } catch (err: any) {
      alert(err.message)
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
          placeholder="添加待办..."
          className="font-mono text-sm flex-1 px-3 py-1.5 bg-[var(--color-surface-strong)]"
          style={{ border: '1px solid var(--color-border)', borderRadius: '6px', outline: 'none' }}
        />
        <button
          type="button"
          onClick={() => setShowUrl(!showUrl)}
          className="font-mono text-xs px-2 py-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-hover)] shrink-0"
          style={{ border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-ink-muted)' }}
          title="添加链接"
        >
          🔗
        </button>
        <button
          type="submit"
          disabled={adding || (!content.trim() && !url.trim())}
          className="font-mono text-xs px-3 py-1.5 rounded-md text-[var(--color-solid-text)] transition-colors disabled:opacity-50 shrink-0"
          style={{ background: 'var(--color-solid)', borderRadius: '6px' }}
        >
          {adding ? '...' : '+'}
        </button>
      </div>
      {showUrl && (
        <input
          type="url"
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="相关链接（可选）"
          className="font-mono text-sm w-full mt-2 px-3 py-1.5 bg-[var(--color-surface-strong)]"
          style={{ border: '1px solid var(--color-border)', borderRadius: '6px', outline: 'none' }}
        />
      )}
    </form>
  )
}

/* ── Interactive Todo Item ────────────────────────────────── */

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

  const saveEdit = async () => {
    if (!editContent.trim() && !editUrl.trim()) return
    setSaving(true)
    try {
      await onUpdate({ content: editContent.trim(), url: editUrl.trim() })
      setEditing(false)
    } catch (err: any) {
      alert(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit() }
    else if (e.key === 'Escape') cancelEdit()
  }

  if (editing) {
    return (
      <div
        className="rounded-md px-3 py-2"
        style={{ border: '2px solid var(--color-ink)', borderRadius: '6px', background: 'var(--color-surface-strong)' }}
      >
        <input
          ref={contentRef}
          type="text"
          value={editContent}
          onChange={e => setEditContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="待办内容..."
          className="font-mono text-sm w-full px-2 py-1 bg-[var(--color-surface-strong)]"
          style={{ border: '1px solid var(--color-border)', borderRadius: '4px', outline: 'none' }}
        />
        <input
          type="url"
          value={editUrl}
          onChange={e => setEditUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="链接（可选）"
          className="font-mono text-sm w-full mt-1 px-2 py-1 bg-[var(--color-surface-strong)]"
          style={{ border: '1px solid var(--color-border)', borderRadius: '4px', outline: 'none' }}
        />
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={saveEdit}
            disabled={saving}
            className="font-mono text-xs px-3 py-1 rounded text-[var(--color-solid-text)] disabled:opacity-50"
            style={{ background: 'var(--color-solid)', borderRadius: '4px' }}
          >
            {saving ? '...' : '保存'}
          </button>
          <button
            onClick={cancelEdit}
            className="font-mono text-xs px-3 py-1 rounded hover:bg-[var(--color-surface-hover)]"
            style={{ border: '1px solid var(--color-border)', borderRadius: '4px', color: 'var(--color-ink-muted)' }}
          >
            取消
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="flex items-start gap-2 rounded-md px-3 py-2 group transition-colors"
      style={{ opacity: todo.done ? 0.6 : 1 }}
    >
      {/* Checkbox */}
      <button
        onClick={onToggle}
        className="mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors"
        style={{
          borderColor: todo.done ? 'var(--color-solid)' : 'var(--color-border-strong)',
          background: todo.done ? 'var(--color-solid)' : 'transparent',
        }}
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
            className="font-mono text-xs mt-0.5 inline-block truncate max-w-full"
            style={{ color: 'var(--color-ink-muted)', textDecoration: 'underline', textUnderlineOffset: '2px' }}
            onClick={e => e.stopPropagation()}
          >
            {todo.url}
          </a>
        )}
      </div>

      {/* Actions */}
      <button
        onClick={startEdit}
        className="opacity-0 group-hover:opacity-100 transition-opacity font-mono text-xs px-1 py-0.5 rounded hover:bg-[var(--color-surface-hover)] shrink-0"
        style={{ color: 'var(--color-ink-muted)' }}
        title="编辑"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      </button>
      <button
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 transition-opacity font-mono text-xs px-1 py-0.5 rounded hover:bg-[var(--color-danger-bg)] shrink-0"
        style={{ color: 'var(--color-danger-text)' }}
        title="删除"
      >
        ✕
      </button>
    </div>
  )
}

/* ── Sidebar (Desktop) ────────────────────────────────────── */

function TodayCreatedTodosSidebar() {
  const { items, loading, toggleDone, updateTodo, deleteTodo, addTodo } = useTodayCreatedTodos()
  const navigate = useNavigate()

  return (
    <div
      className="rounded-lg overflow-hidden sticky top-8"
      style={{ background: 'var(--color-surface-strong)', border: '1px solid var(--color-border)' }}
    >
      <div className="flex items-center justify-between px-4 py-3">
        <p className="font-mono text-sm uppercase tracking-[0.3em] text-[var(--color-ink-secondary)]">
          § 今日待办 §
        </p>
        <button
          onClick={() => navigate({ to: '/todos' })}
          className="font-mono text-xs px-2 py-1 rounded-md transition-colors hover:bg-[var(--color-surface-hover)]"
          style={{ border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-ink-muted)' }}
        >
          全部 →
        </button>
      </div>
      <div style={{ borderTop: '1px dashed var(--color-border)' }} />
      <div className="px-4 py-3">
        <AddTodoForm onAdd={addTodo} />
        {loading ? (
          <p className="text-sm text-[var(--color-ink-muted)] py-4 text-center" style={{ fontFamily: 'Georgia, serif' }}>加载中...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-faint)] py-4 text-center" style={{ fontFamily: 'Georgia, serif' }}>今天还没有创建待办</p>
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

/* ── Inline (Mobile) ──────────────────────────────────────── */

function TodayCreatedTodosInline() {
  const { items, loading, toggleDone, updateTodo, deleteTodo, addTodo } = useTodayCreatedTodos()
  const navigate = useNavigate()

  return (
    <div className="px-6 py-5">
      <div className="flex items-center justify-between mb-4">
        <p className="font-mono text-sm uppercase tracking-[0.3em] text-[var(--color-ink-secondary)]">
          § 今日待办 §
        </p>
        <button
          onClick={() => navigate({ to: '/todos' })}
          className="font-mono text-xs px-3 py-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-hover)]"
          style={{ border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-ink-muted)' }}
        >
          全部 →
        </button>
      </div>
      <AddTodoForm onAdd={addTodo} />
      {loading ? (
        <p className="text-sm text-[var(--color-ink-muted)]" style={{ fontFamily: 'Georgia, serif' }}>加载中...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-[var(--color-ink-faint)]" style={{ fontFamily: 'Georgia, serif' }}>今天还没有创建待办</p>
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

function LoadingScreen() {
  return (
    <main className="flex min-h-[60vh] items-center justify-center px-4">
      <p className="font-mono text-sm text-[var(--color-ink-muted)]">加载中...</p>
    </main>
  )
}
