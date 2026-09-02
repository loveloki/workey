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

export const Route = createFileRoute('/checklists')({ component: ChecklistsPage })

function ChecklistsPage() {
  const { user, loading } = useAuthGuard()

  if (loading) return <LoadingScreen />
  if (!user) return null

  return (
    <main className="max-w-5xl mx-auto px-4 pb-8 pt-8">
      <PageHeader eyebrow="清单" title="检查清单" />
      <ChecklistManager />
    </main>
  )
}

function ChecklistManager() {
  const [activeId, setActiveId] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const { data, isLoading } = useChecklistList()

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
        <p className="font-mono text-sm text-[var(--color-ink)]">自定义检查清单</p>
        <p className="font-serif text-sm mt-1 text-[var(--color-ink-muted)]">
          创建可重复使用的检查清单，记录每次执行时的备注并保存历史快照。
        </p>
      </div>

      {!showCreate && (
        <button
          onClick={() => setShowCreate(true)}
          className="font-mono text-sm px-5 py-2.5 rounded-md text-[var(--color-solid-text)] transition-colors mb-6 bg-[var(--color-solid)]"
        >
          + 新建清单
        </button>
      )}

      {showCreate && (
        <ChecklistForm onSave={handleCreated} onCancel={() => setShowCreate(false)} />
      )}

      {isLoading ? (
        <p className="font-mono text-sm text-center py-8 text-[var(--color-ink-muted)]">
          加载中...
        </p>
      ) : items.length === 0 && !showCreate ? (
        <div className="rounded-lg py-12 text-center border border-dashed border-[var(--color-border)]">
          <p className="font-mono text-sm text-[var(--color-ink-faint)]">
            暂无检查清单
          </p>
          <p className="text-sm mt-1 font-serif text-[var(--color-ink-faint)]">
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
