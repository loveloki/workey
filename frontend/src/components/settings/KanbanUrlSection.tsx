import { useState, useEffect } from 'react'
import { Card } from '../../components/Card'
import { useSettings, useSaveSettings } from '../../lib/queries'

export function KanbanUrlSection() {
  const [url, setUrl] = useState('https://www.fizzy.do/')
  const [msg, setMsg] = useState('')
  const { data, isSuccess } = useSettings()
  const saveMut = useSaveSettings()

  useEffect(() => {
    if (data) setUrl(data.kanban_url || 'https://www.fizzy.do/')
  }, [data])

  const save = async () => {
    setMsg('')
    try {
      await saveMut.mutateAsync({ kanban_url: url })
      setMsg('已保存')
      setTimeout(() => setMsg(''), 2000)
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : '保存失败')
    }
  }

  return (
    <Card title="看板链接">
      <p className="text-sm mb-4" style={{ fontFamily: 'Georgia, serif', color: 'var(--color-ink-muted)' }}>
        设置外部看板工具的链接，在"待办"页面可快捷跳转。
      </p>
      {isSuccess && (
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
            disabled={saveMut.isPending}
            className="font-mono text-sm px-5 py-2 rounded-md text-[var(--color-solid-text)] transition-colors disabled:opacity-50"
            style={{ background: 'var(--color-solid)', borderRadius: '6px' }}
          >
            {saveMut.isPending ? '保存中...' : '保存'}
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
