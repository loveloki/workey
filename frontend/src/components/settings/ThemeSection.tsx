import { useState } from 'react'
import { settings } from '../../lib/api'
import { useTheme, type Theme } from '../../lib/theme-context'
import { Card } from '../../components/Card'

const THEME_OPTIONS: { label: string; value: Theme; icon: string }[] = [
  { label: '浅色', value: 'light', icon: '☀️' },
  { label: '深色', value: 'dark', icon: '🌙' },
  { label: '跟随系统', value: 'auto', icon: '💻' },
]

export function ThemeSection() {
  const { theme, setTheme } = useTheme()
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const handleChange = async (value: Theme) => {
    setTheme(value)
    setSaving(true)
    setMsg('')
    try {
      await settings.save({ theme: value })
      setMsg('已保存')
      setTimeout(() => setMsg(''), 2000)
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card title="主题设置">
      <p className="text-sm mb-4" style={{ fontFamily: 'Georgia, serif', color: 'var(--color-ink-muted)' }}>
        选择界面外观主题。「跟随系统」将根据你的操作系统偏好自动切换。
      </p>
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex gap-2">
          {THEME_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => handleChange(opt.value)}
              disabled={saving}
              className="font-mono text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-50"
              style={{
                background: theme === opt.value ? 'var(--color-solid)' : 'var(--color-surface-strong)',
                color: theme === opt.value ? 'var(--color-solid-text)' : 'var(--color-ink)',
                border: theme === opt.value ? '1px solid var(--color-solid)' : '1px solid var(--color-border)',
                borderRadius: '6px',
              }}
            >
              {opt.icon} {opt.label}
            </button>
          ))}
        </div>
        {msg && (
          <span className="font-mono text-sm" style={{ color: msg === '已保存' ? 'var(--color-ink-muted)' : 'var(--color-danger-text)' }}>
            {msg}
          </span>
        )}
      </div>
    </Card>
  )
}
