import { useNavigate } from '@tanstack/react-router'
import { useCompletedTodosToday } from '../../lib/queries'

export function CompletedTodosSection() {
  const navigate = useNavigate()
  const { data, isLoading } = useCompletedTodosToday()
  const items = data?.todos ?? []

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

      {isLoading ? (
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
              <div
                className="w-4 h-4 mt-0.5 rounded flex items-center justify-center shrink-0"
                style={{ background: 'var(--color-solid)' }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--color-solid-text)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>

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
