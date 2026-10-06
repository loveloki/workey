import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '../components/PageHeader'
import { useAuthGuard } from '../lib/useAuthGuard'
import { LoadingScreen } from '../components/LoadingScreen'
import { LanguageSection } from '../components/settings/LanguageSection'
import { ThemeSection } from '../components/settings/ThemeSection'
import { TimezoneSection } from '../components/settings/TimezoneSection'
import { KanbanUrlSection } from '../components/settings/KanbanUrlSection'
import { PasswordSection } from '../components/settings/PasswordSection'
import { DataSection } from '../components/settings/DataSection'
import { DeleteDataSection } from '../components/settings/DeleteDataSection'
import { VersionSection } from '../components/settings/VersionSection'
import { ReminderSection } from '../components/settings/ReminderSection'
import { IterationSettingsSection } from '../components/settings/IterationSettingsSection'
import { useI18n } from '../lib/i18n'

export const Route = createFileRoute('/settings')({ component: SettingsPage })

function SettingsPage() {
  const { t } = useI18n()
  const { user, loading } = useAuthGuard()

  if (loading) return <LoadingScreen />
  if (!user) return null

  return (
    <main className="max-w-5xl mx-auto px-4 pb-8 pt-8">
      <PageHeader eyebrow={t('settings.eyebrow')} title={t('settings.title')} />

      <div className="grid gap-6">
        <LanguageSection />
        <ThemeSection />
        <TimezoneSection />
        <IterationSettingsSection />
        <KanbanUrlSection />
        <PasswordSection />
        <DataSection />
        <DeleteDataSection />
        <ReminderSection />
        <VersionSection />
      </div>
    </main>
  )
}
