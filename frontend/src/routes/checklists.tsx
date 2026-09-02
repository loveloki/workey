import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '../components/PageHeader'
import { useAuthGuard } from '../lib/useAuthGuard'
import { useState } from 'react'
import { type Checklist } from '../lib/api'
import { LoadingScreen } from '../components/LoadingScreen'
import { ChecklistForm } from '../components/checklists/ChecklistForm'
import { ChecklistCard } from '../components/checklists/ChecklistCard'
import { ChecklistUse } from '../components/checklists/ChecklistUse'
import { useChecklistList } from '../lib/queries'
import { useI18n } from '../lib/i18n'

export const Route = createFileRoute('/checklists')({ component: ChecklistsPage })

function ChecklistsPage() {
  const { user, loading } = useAuthGuard()
  const { t } = useI18n()

  if (loading) return <LoadingScreen />
  if (!user) return null

  return (
    <main className="max-w-5xl mx-auto px-4 pb-8 pt-8">
      <PageHeader eyebrow={t('checklists.eyebrow')} title={t('checklists.title')} />
      <ChecklistManager />
    </main>
  )
}

function ChecklistManager() {
  const [activeId, setActiveId] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const { data, isLoading } = useChecklistList()
  const { t } = useI18n()

  const items = data?.checklists ?? []

  const handleCreated = (_cl: Checklist | Pick<Checklist, 'title' | 'items'>) => {
    setShowCreate(false)
  }

  const handleUpdated = (_cl: Checklist) => {
    // mutation hook 会自动 invalidate query，无需手动更新
  }

  const handleDeleted = (id: number) => {
    if (activeId === id) setActiveId(null)
  }

  const activeChecklist = items.find(c => c.id === activeId)
  if (activeChecklist) {
    return <ChecklistUse checklist={activeChecklist} onBack={() => setActiveId(null)} />
  }

  return (
    <div>
      <div className="rounded-lg px-4 py-3 mb-5 bg-[var(--color-surface-strong)] border border-[var(--color-border)]">
        <p className="font-mono text-sm text-[var(--color-ink)]">{t('checklists.introTitle')}</p>
        <p className="font-serif text-sm mt-1 text-[var(--color-ink-muted)]">
          {t('checklists.introDesc')}
        </p>
      </div>

      {!showCreate && (
        <button
          onClick={() => setShowCreate(true)}
          className="font-mono text-sm px-5 py-2.5 rounded-md text-[var(--color-solid-text)] transition-colors mb-6 bg-[var(--color-solid)]"
        >
          {t('checklists.new')}
        </button>
      )}

      {showCreate && (
        <ChecklistForm onSave={handleCreated} onCancel={() => setShowCreate(false)} />
      )}

      {isLoading ? (
        <p className="font-mono text-sm text-center py-8 text-[var(--color-ink-muted)]">
          {t('common.loading')}
        </p>
      ) : items.length === 0 && !showCreate ? (
        <div className="rounded-lg py-12 text-center border border-dashed border-[var(--color-border)]">
          <p className="font-mono text-sm text-[var(--color-ink-faint)]">
            {t('checklists.empty')}
          </p>
          <p className="text-sm mt-1 font-serif text-[var(--color-ink-faint)]">
            {t('checklists.emptyHint')}
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
