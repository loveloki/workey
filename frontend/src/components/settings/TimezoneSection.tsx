import { useState, useEffect } from 'react'
import { Card } from '../../components/Card'
import { useSettings, useSaveSettings } from '../../lib/queries'
import { useI18n, type TranslationKey } from '../../lib/i18n'

const TIMEZONE_OPTIONS: { labelKey: TranslationKey; value: string }[] = [
  { labelKey: 'settings.timezone.utcMinus12', value: '-12' },
  { labelKey: 'settings.timezone.utcMinus11', value: '-11' },
  { labelKey: 'settings.timezone.utcMinus10', value: '-10' },
  { labelKey: 'settings.timezone.utcMinus9', value: '-9' },
  { labelKey: 'settings.timezone.utcMinus8', value: '-8' },
  { labelKey: 'settings.timezone.utcMinus7', value: '-7' },
  { labelKey: 'settings.timezone.utcMinus6', value: '-6' },
  { labelKey: 'settings.timezone.utcMinus5', value: '-5' },
  { labelKey: 'settings.timezone.utcMinus4', value: '-4' },
  { labelKey: 'settings.timezone.utcMinus3', value: '-3' },
  { labelKey: 'settings.timezone.utcMinus2', value: '-2' },
  { labelKey: 'settings.timezone.utcMinus1', value: '-1' },
  { labelKey: 'settings.timezone.utcPlus0', value: '+0' },
  { labelKey: 'settings.timezone.utcPlus1', value: '+1' },
  { labelKey: 'settings.timezone.utcPlus2', value: '+2' },
  { labelKey: 'settings.timezone.utcPlus3', value: '+3' },
  { labelKey: 'settings.timezone.utcPlus4', value: '+4' },
  { labelKey: 'settings.timezone.utcPlus5', value: '+5' },
  { labelKey: 'settings.timezone.utcPlus5_5', value: '+5.5' },
  { labelKey: 'settings.timezone.utcPlus6', value: '+6' },
  { labelKey: 'settings.timezone.utcPlus7', value: '+7' },
  { labelKey: 'settings.timezone.utcPlus8', value: '+8' },
  { labelKey: 'settings.timezone.utcPlus9', value: '+9' },
  { labelKey: 'settings.timezone.utcPlus10', value: '+10' },
  { labelKey: 'settings.timezone.utcPlus11', value: '+11' },
  { labelKey: 'settings.timezone.utcPlus12', value: '+12' },
]

export function TimezoneSection() {
  const { t } = useI18n()
  const [timezone, setTimezone] = useState('+8')
  const [msg, setMsg] = useState<'' | 'saved' | 'error'>('')
  const [errorText, setErrorText] = useState('')
  const { data, isSuccess } = useSettings()
  const saveMut = useSaveSettings()

  useEffect(() => {
    if (data) setTimezone(data.timezone)
  }, [data])

  const save = async () => {
    setMsg('')
    setErrorText('')
    try {
      await saveMut.mutateAsync({ timezone })
      setMsg('saved')
      setTimeout(() => setMsg(''), 2000)
    } catch (e: unknown) {
      setErrorText(e instanceof Error ? e.message : t('common.saveFailed'))
      setMsg('error')
    }
  }

  return (
    <Card title={t('settings.timezone.title')}>
      <p className="text-sm mb-4 font-serif text-[var(--color-ink-muted)]">
        {t('settings.timezone.desc')}
      </p>
      {isSuccess && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <select
            value={timezone}
            onChange={e => setTimezone(e.target.value)}
            className="font-mono text-sm px-3 py-2 rounded-md bg-[var(--color-surface-strong)] w-full sm:w-auto border border-[var(--color-border)]"
          >
            {TIMEZONE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>
                {t(opt.labelKey)}
              </option>
            ))}
          </select>
          <button
            onClick={save}
            disabled={saveMut.isPending}
            className="font-mono text-sm px-5 py-2 rounded-md text-[var(--color-solid-text)] transition-colors disabled:opacity-50 bg-[var(--color-solid)]"
          >
            {saveMut.isPending ? t('common.saving') : t('common.save')}
          </button>
          {msg && (
            <span
              className={`font-mono text-sm ${msg === 'saved' ? 'text-[var(--color-ink-muted)]' : 'text-[var(--color-danger-text)]'}`}
            >
              {msg === 'saved' ? t('common.saved') : errorText}
            </span>
          )}
        </div>
      )}
    </Card>
  )
}
