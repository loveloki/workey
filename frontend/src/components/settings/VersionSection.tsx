import { Card } from '../../components/Card'
import { useSystemVersion } from '../../lib/queries'
import { useI18n } from '../../lib/i18n'

export function VersionSection() {
  const { t } = useI18n()
  const { data: version, isLoading } = useSystemVersion()

  return (
    <Card title={t('settings.version.title')}>
      <p className="text-sm mb-4 font-serif text-[var(--color-ink-muted)]">
        {t('settings.version.desc')}
      </p>
      {isLoading ? (
        <p className="font-mono text-sm text-[var(--color-ink-muted)]">
          {t('common.loading')}
        </p>
      ) : version ? (
        <div className="space-y-2 font-mono text-sm">
          <div className="flex flex-col sm:flex-row sm:gap-4">
            <span className="text-[var(--color-ink-muted)] min-w-[80px]">{t('settings.version.date')}</span>
            <span className="text-[var(--color-ink)]">{version.date}</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:gap-4">
            <span className="text-[var(--color-ink-muted)] min-w-[80px]">{t('settings.version.commit')}</span>
            <span className="text-[var(--color-ink)]">{version.commit}</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:gap-4">
            <span className="text-[var(--color-ink-muted)] min-w-[80px]">{t('settings.version.content')}</span>
            <span className="text-[var(--color-ink)]">{version.content}</span>
          </div>
        </div>
      ) : (
        <p className="font-mono text-sm text-[var(--color-ink-muted)]">
          {t('settings.version.unknown')}
        </p>
      )}
    </Card>
  )
}
