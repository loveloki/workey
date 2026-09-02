import { useNavigate } from '@tanstack/react-router'
import { useCompletedTodosToday } from '../../lib/queries'
import { useI18n } from '../../lib/i18n'

export function CompletedTodosSection() {
  const navigate = useNavigate()
  const { t } = useI18n()
  const { data, isLoading } = useCompletedTodosToday()
  const items = data?.todos ?? []

  return (
    <div className="px-6 py-5">
      <div className="flex items-center justify-between mb-4">
        <p className="font-mono text-sm uppercase tracking-[0.3em] text-[var(--color-ink-secondary)]">{t('dashboard.completedTodos.title')}</p>
        <button
          onClick={() => navigate({ to: '/todos' })}
          className="font-mono text-xs px-3 py-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-hover)] border border-[var(--color-border)] text-[var(--color-ink-muted)]"
        >
          {t('common.viewAll')}
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-[var(--color-ink-muted)] font-serif">{t('common.loading')}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-[var(--color-ink-faint)] font-serif">{t('dashboard.completedTodos.empty')}</p>
      ) : (
        <div className="space-y-1">
          {items.map(todo => (
            <div
              key={todo.id}
              className="flex items-start gap-3 px-2 py-2"
            >
              <div
                className="w-4 h-4 mt-0.5 rounded flex items-center justify-center shrink-0 bg-[var(--color-solid)]"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--color-solid-text)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>

              <div className="flex-1 min-w-0">
                <p
                  className="text-sm text-[var(--color-ink-muted)] font-serif break-words"
                >
                  {todo.content || <span className="text-[var(--color-ink-faint)]">{t('common.empty')}</span>}
                </p>
                {todo.url && (
                  <a
                    href={todo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs mt-0.5 inline-block truncate max-w-full text-[var(--color-ink-faint)] underline underline-offset-2"
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
