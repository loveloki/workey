import { useState, useEffect } from 'react'
import { settings } from '../../lib/api'
import { Card } from '../../components/Card'

export function KanbanUrlSection() {
  const [url, setUrl] = useState('https://www.fizzy.do/')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    settings.get().then(data => {
      setUrl(data.kanban_url || 'https://www.fizzy.do/')
      setLoaded(true)
    })
  }, [])

  const save = async () => {
    setSaving(true)
    setMsg('')
    try {
      await settings.save({ kanban_url: url })
      setMsg('已保存')
      setTimeout(() => setMsg(''), 2000)
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card title="看板链接">
      <p className="text-sm mb-4" style={{ fontFamily: 'Georgia, serif', color: 'var(--color-ink-muted)' }}>
        设置外部看板工具的链接，在"待办"页面可快捷跳转。
      </p>
      {loaded && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <input
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://www.fizzy.do/"
            className="font-mono text-sm px-3 py-2 bg-[var(--color-surface-strong)] w-full sm:w-96"
            style={{ border: '1px solid var(--color-border)', borderRadius: '6px', outline: 'none' }}
          />
          <button
            onClick={save}
            disabled={saving}
            className="font-mono text-sm px-5 py-2 rounded-md text-[var(--color-solid-text)] transition-colors disabled:opacity-50"
            style={{ background: 'var(--color-solid)', borderRadius: '6px' }}
          >
            {saving ? '保存中...' : '保存'}
          </button>
          {msg && (
            <span className="font-mono text-sm" style={{ color: msg === '已保存' ? 'var(--color-ink-muted)' : 'var(--color-danger-text)' }}>
              {msg}
            </span>
          )}
        </div>
      )}
    </Card>
  )
}
