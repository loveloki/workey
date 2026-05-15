import React, { useState, useEffect } from 'react'
import { getToday } from '../../lib/date-utils'
import { useToast } from '../../lib/toast-context'
import { MarkdownEditor } from '../../lib/markdown-editor'
import { useWorkLogToday, useSaveWorkLog } from '../../lib/queries'

export function WorkLogSection({ toolbarExtra }: { toolbarExtra?: React.ReactNode }) {
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
      toastError(e instanceof Error ? e.message : '保存失败')
    }
  }

  return (
    <div className="px-6 py-5">
      <p className="mb-4 font-mono text-sm uppercase tracking-[0.3em] text-[var(--color-ink-secondary)]">§ 工作内容 §</p>

      {isLoading ? (
        <p className="text-sm text-[var(--color-ink-muted)] font-serif">加载中...</p>
      ) : (
        <>
          <div className="mb-4">
            <MarkdownEditor
              value={content}
              onChange={setContent}
              placeholder="记录今天的工作内容..."
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
              {saveMut.isPending ? '保存中...' : '保存'}
            </button>
            {saved && <span className="text-sm font-serif text-[var(--color-ink-muted)]">✓ 已保存</span>}
          </div>
        </>
      )}
    </div>
  )
}
