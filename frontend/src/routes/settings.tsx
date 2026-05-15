import { createFileRoute } from '@tanstack/react-router'
import { useAuthGuard } from '../lib/useAuthGuard'
import { LoadingScreen } from '../components/LoadingScreen'
import { ThemeSection } from '../components/settings/ThemeSection'
import { TimezoneSection } from '../components/settings/TimezoneSection'
import { IterationSection } from '../components/settings/IterationSection'
import { KanbanUrlSection } from '../components/settings/KanbanUrlSection'
import { PasskeySection } from '../components/settings/PasskeySection'
import { PasswordSection } from '../components/settings/PasswordSection'
import { DataSection } from '../components/settings/DataSection'
import { DeleteDataSection } from '../components/settings/DeleteDataSection'
import { VersionSection } from '../components/settings/VersionSection'

export const Route = createFileRoute('/settings')({ component: SettingsPage })

function SettingsPage() {
  const { user, loading } = useAuthGuard()

  if (loading) return <LoadingScreen />
  if (!user) return null

  return (
    <main className="max-w-5xl mx-auto px-4 pb-8 pt-8">
      <div className="mb-6">
        <p className="mb-1 font-mono text-sm uppercase tracking-[0.3em] text-[var(--color-ink-secondary)]">§ 设置</p>
        <h1
          className="text-3xl font-normal tracking-tight text-[var(--color-ink)] sm:text-4xl"
          style={{ fontFamily: 'Georgia, serif' }}
        >
          偏好设置
        </h1>
      </div>

      <div className="grid gap-6">
        <ThemeSection />
        <TimezoneSection />
        <IterationSection />
        <KanbanUrlSection />
        <PasskeySection />
        <PasswordSection />
        <DataSection />
        <DeleteDataSection />
        <VersionSection />
      </div>
    </main>
  )
}
