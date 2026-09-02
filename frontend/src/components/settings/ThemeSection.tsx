import { useState } from 'react'
import { settings } from '../../lib/api'
import { useTheme, type Theme } from '../../lib/theme-context'
import { Card } from '../../components/Card'
import { useI18n, type TranslationKey } from '../../lib/i18n'

const THEME_OPTIONS: { labelKey: TranslationKey; value: Theme; icon: string }[] = [
  { labelKey: 'settings.theme.light', value: 'light', icon: '☀️' },
  { labelKey: 'settings.theme.dark', value: 'dark', icon: '🌙' },
  { labelKey: 'settings.theme.auto', value: 'auto', icon: '💻' },
]

export function ThemeSection() {
  const { t } = useI18n()
  const { theme, setTheme } = useTheme()
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<'' | 'saved' | 'error'>('')
  const [errorText, setErrorText] = useState('')

  const handleChange = async (value: Theme) => {
    setTheme(value)
    setSaving(true)
    setMsg('')
    try {
      await settings.save({ theme: value })
      setMsg('saved')
      setTimeout(() => setMsg(''), 2000)
    } catch (e: unknown) {
      setErrorText(e instanceof Error ? e.message : t('common.saveFailed'))
      setMsg('error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card title={t('settings.theme.title')}>
      <p className="text-sm mb-4 font-serif text-[var(--color-ink-muted)]">
        {t('settings.theme.desc')}
      </p>
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex gap-2">
          {THEME_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => handleChange(opt.value)}
              disabled={saving}
              className={`font-mono text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-50 ${
                theme === opt.value
                  ? 'bg-[var(--color-solid)] text-[var(--color-solid-text)] border border-[var(--color-solid)]'
                  : 'bg-[var(--color-surface-strong)] text-[var(--color-ink)] border border-[var(--color-border)]'
              }`}
            >
              {opt.icon} {t(opt.labelKey)}
            </button>
          ))}
        </div>
        {msg && (
          <span
            className={`font-mono text-sm ${msg === 'saved' ? 'text-[var(--color-ink-muted)]' : 'text-[var(--color-danger-text)]'}`}
          >
            {msg === 'saved' ? t('common.saved') : errorText}
          </span>
        )}
      </div>
    </Card>
  )
}
