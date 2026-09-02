import { useI18n } from '../lib/i18n'

export function LoadingScreen() {
  const { t } = useI18n()
  return (
    <main className="flex min-h-[60vh] items-center justify-center px-4">
      <p className="font-mono text-sm text-[var(--color-ink-muted)]">{t('common.loading')}</p>
    </main>
  )
}
