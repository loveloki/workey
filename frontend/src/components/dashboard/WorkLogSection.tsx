import React, { useState, useEffect, useRef } from 'react'
import { getToday } from '../../lib/date-utils'
import { useToast } from '../../lib/toast-context'
import { MarkdownEditor } from '../../lib/markdown-editor'
import { useWorkLogToday, useSaveWorkLog } from '../../lib/queries'
import { useI18n } from '../../lib/i18n'

const AUTO_SAVE_DELAY = 800

type AutoSaveState = 'idle' | 'saving' | 'saved' | 'error'

export function WorkLogSection({ toolbarExtra }: { toolbarExtra?: React.ReactNode }) {
  const { t } = useI18n()
  const [content, setContent] = useState('')
  const [hasEdited, setHasEdited] = useState(false)
  const [autoSaveState, setAutoSaveState] = useState<AutoSaveState>('idle')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveVersionRef = useRef(0)
  const { data, isLoading } = useWorkLogToday()
  const saveMut = useSaveWorkLog()
  const saveMutateAsyncRef = useRef(saveMut.mutateAsync)
  saveMutateAsyncRef.current = saveMut.mutateAsync
  const { toastError, toastSuccess } = useToast()

  useEffect(() => {
    if (data?.work_log && !hasEdited) {
      setContent((data.work_log.content || '').replace(/^\s+/, ''))
    }
  }, [data, hasEdited])

  useEffect(() => {
    if (!hasEdited) return

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    const version = ++saveVersionRef.current
    setAutoSaveState('idle')

    saveTimerRef.current = setTimeout(async () => {
      setAutoSaveState('saving')
      try {
        await saveMutateAsyncRef.current({ date: getToday(), content })
        if (version === saveVersionRef.current) {
          setAutoSaveState('saved')
          toastSuccess(t('common.saved'))
        }
      } catch (e: unknown) {
        if (version === saveVersionRef.current) {
          setAutoSaveState('error')
          toastError(e instanceof Error ? e.message : t('common.saveFailed'))
        }
      }
    }, AUTO_SAVE_DELAY)

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [content, hasEdited, t, toastError, toastSuccess])

  const statusMessage = autoSaveState === 'saving'
    ? t('common.saving')
    : autoSaveState === 'saved'
      ? t('common.savedCheck')
      : autoSaveState === 'error'
        ? t('common.saveFailed')
        : null

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
              onChange={nextContent => {
                setContent(nextContent)
                setHasEdited(true)
              }}
              placeholder={t('worklog.placeholder')}
              rows={10}
              toolbarExtra={toolbarExtra}
            />
          </div>
          {statusMessage && (
            <p aria-live="polite" className={`text-sm font-serif ${autoSaveState === 'error' ? 'text-[var(--color-danger-text)]' : 'text-[var(--color-ink-muted)]'}`}>
              {statusMessage}
            </p>
          )}
        </>
      )}
    </div>
  )
}
