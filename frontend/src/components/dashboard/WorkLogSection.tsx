import { useState, useEffect } from 'react'
import { workLogs } from '../../lib/api'
import { getToday } from '../../lib/date-utils'
import { MarkdownEditor } from '../../lib/markdown-editor'

export function WorkLogSection() {
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    workLogs.today().then(d => {
      if (d.work_log) setContent((d.work_log.content || '').replace(/^\s+/, ''))
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      await workLogs.save(getToday(), content)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : '保存失败')
    }
    setSaving(false)
  }

  return (
    <div className="px-6 py-5">
      <p className="mb-4 font-mono text-sm uppercase tracking-[0.3em] text-[var(--color-ink-secondary)]">§ 工作内容 §</p>

      {loading ? (
        <p className="text-sm text-[var(--color-ink-muted)]" style={{ fontFamily: 'Georgia, serif' }}>加载中...</p>
      ) : (
        <>
          <div className="mb-4">
            <MarkdownEditor
              value={content}
              onChange={setContent}
              placeholder="记录今天的工作内容..."
              rows={10}
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={save}
              disabled={saving}
              className="rounded-md px-5 py-2.5 font-mono text-sm hover:bg-[var(--color-solid-hover)] disabled:opacity-50"
              style={{ background: 'var(--color-solid)', color: 'var(--color-solid-text)' }}
            >
              {saving ? '保存中...' : '保存'}
            </button>
            {saved && <span className="text-sm" style={{ fontFamily: 'Georgia, serif', color: 'var(--color-ink-muted)' }}>✓ 已保存</span>}
          </div>
        </>
      )}
    </div>
  )
}
