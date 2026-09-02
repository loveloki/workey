import { Card } from '../../components/Card'
import { useI18n, SUPPORTED_LANGUAGES, type Language, type TranslationKey } from '../../lib/i18n'

const LANGUAGE_LABELS: Record<Language, { native: string; key: TranslationKey }> = {
  'zh-CN': { native: '中文', key: 'settings.language.zh' },
  'en-US': { native: 'English', key: 'settings.language.en' },
}

export function LanguageSection() {
  const { t, lang, setLang } = useI18n()

  return (
    <Card title={t('settings.language.title')}>
      <p className="text-sm mb-4 font-serif text-[var(--color-ink-muted)]">
        {t('settings.language.desc')}
      </p>
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex gap-2">
          {SUPPORTED_LANGUAGES.map(option => (
            <button
              key={option}
              onClick={() => setLang(option)}
              aria-pressed={lang === option}
              className={`font-mono text-sm px-4 py-2 rounded-md transition-colors ${
                lang === option
                  ? 'bg-[var(--color-solid)] text-[var(--color-solid-text)] border border-[var(--color-solid)]'
                  : 'bg-[var(--color-surface-strong)] text-[var(--color-ink)] border border-[var(--color-border)]'
              }`}
            >
              {LANGUAGE_LABELS[option].native}
            </button>
          ))}
        </div>
        <span className="font-mono text-sm text-[var(--color-ink-muted)]">
          {t('settings.language.current', { name: t(LANGUAGE_LABELS[lang].key) })}
        </span>
      </div>
    </Card>
  )
}
