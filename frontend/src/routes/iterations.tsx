import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '../components/PageHeader'
import { useAuthGuard } from '../lib/useAuthGuard'
import { LoadingScreen } from '../components/LoadingScreen'
import { IterationCalendar } from '../components/iterations/IterationCalendar'
import { useI18n } from '../lib/i18n'

export const Route = createFileRoute('/iterations')({ component: IterationsPage })

function IterationsPage() {
  const { t } = useI18n()
  const { user, loading } = useAuthGuard()

  if (loading) return <LoadingScreen />
  if (!user) return null

  return (
    <main className="max-w-7xl mx-auto px-4 pb-8 pt-8">
      <PageHeader
        eyebrow={t('iterations.eyebrow')}
        title={t('iterations.title')}
      />
      <IterationCalendar />
    </main>
  )
}
