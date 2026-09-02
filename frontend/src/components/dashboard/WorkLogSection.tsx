import React, { useState, useEffect } from 'react'
import { getToday } from '../../lib/date-utils'
import { useToast } from '../../lib/toast-context'
import { MarkdownEditor } from '../../lib/markdown-editor'
import { useWorkLogToday, useSaveWorkLog } from '../../lib/queries'
import { useI18n } from '../../lib/i18n'

export function WorkLogSection({ toolbarExtra }: { toolbarExtra?: React.ReactNode }) {
  const { t } = useI18n()
  const [content, setContent] = useState('')
  const [saved, setSaved] = useState(false)
  const { data, isLoading } = useWorkLogToday()
  const saveMut = useSaveWorkLog()
  const { toastError } = useToast()

  useEffect(() => {
    if (data?.work_log) {
      setContent((data.work_log.content || '').replace(/^\s+/, ''))
    }
  }, [data])

  const save = async () => {
    try {
      await saveMut.mutateAsync({ date: getToday(), content })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e: unknown) {
      toastError(e instanceof Error ? e.message : t('common.saveFailed'))
    }
  }

  return (
    <div className="px-6 py-5">
      <p className="mb-4 font-mono text-sm uppercase tracking-[0.3em] text-[var(--color-ink-secondary)]">{t('worklog.sectionTitle')}</p>

      {isLoading ? (
        <p className="text-sm text-[var(--color-ink-muted)] font-serif">{t('common.loading')}</p>
      ) : (
        <>
          <div className="mb-4">
            <MarkdownEditor
              value={content}
              onChange={setContent}
              placeholder={t('worklog.placeholder')}
              rows={10}
              toolbarExtra={toolbarExtra}
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={save}
              disabled={saveMut.isPending}
              className="rounded-md px-5 py-2.5 font-mono text-sm hover:bg-[var(--color-solid-hover)] disabled:opacity-50 bg-[var(--color-solid)] text-[var(--color-solid-text)]"
            >
              {saveMut.isPending ? t('common.saving') : t('common.save')}
            </button>
            {saved && <span className="text-sm font-serif text-[var(--color-ink-muted)]">{t('common.savedCheck')}</span>}
          </div>
        </>
      )}
    </div>
  )
}
