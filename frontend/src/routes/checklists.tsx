import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useAuth } from '../lib/auth-context'
import { useState, useEffect } from 'react'
import { checklists as checklistsApi, type Checklist } from '../lib/api'
import { LoadingScreen } from '../components/LoadingScreen'
import { ChecklistForm } from '../components/checklists/ChecklistForm'
import { ChecklistCard } from '../components/checklists/ChecklistCard'
import { ChecklistUse } from '../components/checklists/ChecklistUse'

export const Route = createFileRoute('/checklists')({ component: ChecklistsPage })

function ChecklistsPage() {
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: '/login' })
  }, [authLoading, user, navigate])

  if (authLoading) return <LoadingScreen />
  if (!user) return null

  return (
    <main className="max-w-5xl mx-auto px-4 pb-8 pt-8">
      <div className="mb-6">
        <p className="mb-1 font-mono text-sm uppercase tracking-[0.3em] text-[var(--color-ink-secondary)]">
          § 检查清单
        </p>
        <h1
          className="text-3xl font-normal tracking-tight text-[var(--color-ink)] sm:text-4xl"
          style={{ fontFamily: 'Georgia, serif' }}
        >
          Checklists
        </h1>
      </div>
      <ChecklistManager />
    </main>
  )
}

function ChecklistManager() {
  const [items, setItems] = useState<Checklist[]>([])
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const load = async () => {
    const data = await checklistsApi.list()
    setItems(data.checklists)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const handleCreated = (cl: Checklist | Pick<Checklist, 'title' | 'items'>) => {
    setItems(prev => [cl as Checklist, ...prev])
    setShowCreate(false)
  }

  const handleUpdated = (cl: Checklist) => {
    setItems(prev => prev.map(c => (c.id === cl.id ? cl : c)))
  }

  const handleDeleted = (id: number) => {
    setItems(prev => prev.filter(c => c.id !== id))
    if (activeId === id) setActiveId(null)
  }

  const activeChecklist = items.find(c => c.id === activeId)
  if (activeChecklist) {
    return <ChecklistUse checklist={activeChecklist} onBack={() => setActiveId(null)} />
  }

  return (
    <div>
      {!showCreate && (
        <button
          onClick={() => setShowCreate(true)}
          className="font-mono text-sm px-5 py-2.5 rounded-md text-[var(--color-solid-text)] transition-colors mb-6"
          style={{ background: 'var(--color-solid)', borderRadius: '6px' }}
        >
          + 新建清单
        </button>
      )}

      {showCreate && (
        <ChecklistForm onSave={handleCreated} onCancel={() => setShowCreate(false)} />
      )}

      {loading ? (
        <p className="font-mono text-sm text-center py-8" style={{ color: 'var(--color-ink-muted)' }}>
          加载中...
        </p>
      ) : items.length === 0 && !showCreate ? (
        <div className="rounded-lg py-12 text-center" style={{ border: '1px dashed var(--color-border)' }}>
          <p className="font-mono text-sm" style={{ color: 'var(--color-ink-faint)' }}>
            暂无检查清单
          </p>
          <p className="text-sm mt-1" style={{ fontFamily: 'Georgia, serif', color: 'var(--color-ink-faint)' }}>
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
