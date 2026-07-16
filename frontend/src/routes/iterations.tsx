import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '../components/PageHeader'
import { useAuthGuard } from '../lib/useAuthGuard'
import { LoadingScreen } from '../components/LoadingScreen'
import { IterationCalendar } from '../components/iterations/IterationCalendar'

export const Route = createFileRoute('/iterations')({ component: IterationsPage })

function IterationsPage() {
  const { user, loading } = useAuthGuard()

  if (loading) return <LoadingScreen />
  if (!user) return null

  return (
    <main className="max-w-7xl mx-auto px-4 pb-8 pt-8">
      <PageHeader
        eyebrow="设置"
        title="Iteration 管理"
      />
      <IterationCalendar />
    </main>
  )
}
