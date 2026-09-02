import { useState, useEffect } from 'react'
import { Card } from '../../components/Card'
import { useSettings, useSaveSettings } from '../../lib/queries'
import { useI18n } from '../../lib/i18n'

export function KanbanUrlSection() {
  const { t } = useI18n()
  const [url, setUrl] = useState('https://www.fizzy.do/')
  const [msg, setMsg] = useState<'' | 'saved' | 'error'>('')
  const [errorText, setErrorText] = useState('')
  const { data, isSuccess } = useSettings()
  const saveMut = useSaveSettings()

  useEffect(() => {
    if (data) setUrl(data.kanban_url || 'https://www.fizzy.do/')
  }, [data])

  const save = async () => {
    setMsg('')
    setErrorText('')
    try {
      await saveMut.mutateAsync({ kanban_url: url })
      setMsg('saved')
      setTimeout(() => setMsg(''), 2000)
    } catch (e: unknown) {
      setErrorText(e instanceof Error ? e.message : t('common.saveFailed'))
      setMsg('error')
    }
  }

  return (
    <Card title={t('settings.kanbanUrl.title')}>
      <p className="text-sm mb-4 font-serif text-[var(--color-ink-muted)]">
        {t('settings.kanbanUrl.desc')}
      </p>
      {isSuccess && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <input
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://www.fizzy.do/"
            className="font-mono text-sm px-3 py-2 bg-[var(--color-surface-strong)] w-full sm:w-96 border border-[var(--color-border)] rounded-md outline-none"
          />
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
