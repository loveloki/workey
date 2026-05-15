import { useState, useEffect } from 'react'
import { Card } from '../../components/Card'
import { useSettings, useSaveSettings } from '../../lib/queries'

const TIMEZONE_OPTIONS = [
  { label: 'UTC-12', value: '-12' },
  { label: 'UTC-11', value: '-11' },
  { label: 'UTC-10 (夏威夷)', value: '-10' },
  { label: 'UTC-9 (阿拉斯加)', value: '-9' },
  { label: 'UTC-8 (太平洋)', value: '-8' },
  { label: 'UTC-7 (山地)', value: '-7' },
  { label: 'UTC-6 (中部)', value: '-6' },
  { label: 'UTC-5 (东部)', value: '-5' },
  { label: 'UTC-4', value: '-4' },
  { label: 'UTC-3', value: '-3' },
  { label: 'UTC-2', value: '-2' },
  { label: 'UTC-1', value: '-1' },
  { label: 'UTC+0 (伦敦)', value: '+0' },
  { label: 'UTC+1 (中欧)', value: '+1' },
  { label: 'UTC+2 (东欧)', value: '+2' },
  { label: 'UTC+3 (莫斯科)', value: '+3' },
  { label: 'UTC+4', value: '+4' },
  { label: 'UTC+5', value: '+5' },
  { label: 'UTC+5:30 (印度)', value: '+5.5' },
  { label: 'UTC+6', value: '+6' },
  { label: 'UTC+7 (曼谷)', value: '+7' },
  { label: 'UTC+8 (北京)', value: '+8' },
  { label: 'UTC+9 (东京)', value: '+9' },
  { label: 'UTC+10 (悉尼)', value: '+10' },
  { label: 'UTC+11', value: '+11' },
  { label: 'UTC+12 (奥克兰)', value: '+12' },
]

export function TimezoneSection() {
  const [timezone, setTimezone] = useState('+8')
  const [msg, setMsg] = useState('')
  const { data, isSuccess } = useSettings()
  const saveMut = useSaveSettings()

  useEffect(() => {
    if (data) setTimezone(data.timezone)
  }, [data])

  const save = async () => {
    setMsg('')
    try {
      await saveMut.mutateAsync({ timezone })
      setMsg('已保存')
      setTimeout(() => setMsg(''), 2000)
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : '保存失败')
    }
  }

  return (
    <Card title="时区设置">
      <p className="text-sm mb-4 font-serif text-[var(--color-ink-muted)]">
        设置你的工作时区，影响打卡时间的显示。
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
                {opt.label}
              </option>
            ))}
          </select>
          <button
            onClick={save}
            disabled={saveMut.isPending}
            className="font-mono text-sm px-5 py-2 rounded-md text-[var(--color-solid-text)] transition-colors disabled:opacity-50 bg-[var(--color-solid)]"
          >
            {saveMut.isPending ? '保存中...' : '保存'}
          </button>
          {msg && (
            <span
              className={`font-mono text-sm ${msg === '已保存' ? 'text-[var(--color-ink-muted)]' : 'text-[var(--color-danger-text)]'}`}
            >
              {msg}
            </span>
          )}
        </div>
      )}
    </Card>
  )
}
