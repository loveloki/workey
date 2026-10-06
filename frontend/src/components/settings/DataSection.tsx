import { useState } from 'react'
import { settings } from '../../lib/api'
import { Card } from '../../components/Card'
import { useI18n } from '../../lib/i18n'

export function DataSection() {
  const { t } = useI18n()
  const [exporting, setExporting] = useState(false)
  const [msg, setMsg] = useState('')
  const [isError, setIsError] = useState(false)

  const handleExport = async () => {
    setExporting(true)
    setMsg('')
    try {
      const blob = await settings.exportData()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `workey-export-${new Date().toISOString().split('T')[0]}.zip`
      a.click()
      URL.revokeObjectURL(url)
      setMsg(t('data.export.success'))
      setIsError(false)
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : t('data.export.failed'))
      setIsError(true)
    } finally {
      setExporting(false)
    }
  }

  return (
    <Card title={t('data.title')}>
      <p className="text-sm mb-4 font-serif text-[var(--color-ink-muted)]">
        {t('data.description')}
      </p>
      <button
        onClick={handleExport}
        disabled={exporting}
        className="font-mono text-sm px-5 py-2 rounded-md text-[var(--color-solid-text)] transition-colors disabled:opacity-50 bg-[var(--color-solid)]"
      >
        {exporting ? t('data.export.exporting') : t('data.export.button')}
      </button>
      {msg && (
        <p
          className={`font-mono text-sm mt-3 ${isError ? 'text-[var(--color-danger-text)]' : 'text-[var(--color-ink-muted)]'}`}
        >
          {msg}
        </p>
      )}
    </Card>
  )
}
