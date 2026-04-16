import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useAuth } from '../lib/auth-context'
import { useState, useEffect, useRef } from 'react'
import { settings, system, passkeys as passkeysApi, iterationOverrides as overridesApi, base64urlToBuffer, type Passkey, type IterationOverride } from '../lib/api'
import { makeIterationConfig, getCurrentIteration, getIterationRange, computeIterations, type IterationConfig, type IterationOverrideMap } from '../lib/date-utils'
import { useTheme, type Theme } from '../lib/theme-context'

export const Route = createFileRoute('/settings')({ component: SettingsPage })

function SettingsPage() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!loading && !user) navigate({ to: '/login' })
  }, [loading, user, navigate])

  if (loading) return <LoadingScreen />
  if (!user) return null

  return (
    <main className="max-w-5xl mx-auto px-4 pb-8 pt-8">
      <div className="mb-6">
        <p className="mb-1 font-mono text-sm uppercase tracking-[0.3em] text-[var(--color-ink-secondary)]">§ 设置</p>
        <h1
          className="text-3xl font-normal tracking-tight text-[var(--color-ink)] sm:text-4xl"
          style={{ fontFamily: 'Georgia, serif' }}
        >
          偏好设置
        </h1>
      </div>

      <div className="grid gap-6">
        <ThemeSection />
        <TimezoneSection />
        <IterationSection />
        <KanbanUrlSection />
        <PasskeySection />
        <PasswordSection />
        <DataSection />
        <DeleteDataSection />
        <VersionSection />
      </div>
    </main>
  )
}

/* ── Theme ──────────────────────────────────────────── */

const THEME_OPTIONS: { label: string; value: Theme; icon: string }[] = [
  { label: '浅色', value: 'light', icon: '☀️' },
  { label: '深色', value: 'dark', icon: '🌙' },
  { label: '跟随系统', value: 'auto', icon: '💻' },
]

function ThemeSection() {
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
    } catch (e: any) {
      setMsg(e.message || '保存失败')
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

/* ── Timezone ───────────────────────────────────────── */

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

function TimezoneSection() {
  const [timezone, setTimezone] = useState('+8')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    settings.get().then(data => {
      setTimezone(data.timezone)
      setLoaded(true)
    })
  }, [])

  const save = async () => {
    setSaving(true)
    setMsg('')
    try {
      await settings.save({ timezone })
      setMsg('已保存')
      setTimeout(() => setMsg(''), 2000)
    } catch (e: any) {
      setMsg(e.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card title="时区设置">
      <p className="text-sm mb-4" style={{ fontFamily: 'Georgia, serif', color: 'var(--color-ink-muted)' }}>
        设置你的工作时区，影响打卡时间的显示。
      </p>
      {loaded && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <select
            value={timezone}
            onChange={e => setTimezone(e.target.value)}
            className="font-mono text-sm px-3 py-2 rounded-md bg-[var(--color-surface-strong)] w-full sm:w-auto"
            style={{ border: '1px solid var(--color-border)', borderRadius: '6px' }}
          >
            {TIMEZONE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
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

/* ── Iteration ───────────────────────────────────────── */

const VIEW_SIZE = 10
const FUTURE_BUFFER = 2

function IterationSection() {
  const [startDate, setStartDate] = useState('2019-09-02')
  const [durationDays, setDurationDays] = useState('14')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [iterConfig, setIterConfig] = useState<IterationConfig | null>(null)
  const [overrides, setOverrides] = useState<IterationOverrideMap>({})
  const [viewCenter, setViewCenter] = useState<number | null>(null)
  const [editingIter, setEditingIter] = useState<number | null>(null)
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')
  const [editError, setEditError] = useState('')

  const loadData = async () => {
    try {
      const [data, ovRes] = await Promise.all([settings.get(), overridesApi.list()])
      const sd = data.iteration_start_date || '2019-09-02'
      const dd = data.iteration_duration_days || '14'
      setStartDate(sd)
      setDurationDays(dd)
      const cfg = makeIterationConfig(sd, dd)
      setIterConfig(cfg)
      const ovMap: IterationOverrideMap = {}
      for (const o of ovRes.overrides) {
        ovMap[o.iteration_number] = { start: o.start_date, end: o.end_date }
      }
      setOverrides(ovMap)
      if (viewCenter === null) {
        setViewCenter(getCurrentIteration(cfg, ovMap))
      }
      setLoaded(true)
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => { loadData() }, [])

  const saveBase = async () => {
    const d = new Date(startDate + 'T00:00:00')
    if (isNaN(d.getTime())) { setMsg('起始日期格式无效'); return }
    const days = parseInt(durationDays, 10)
    if (isNaN(days) || days < 1) { setMsg('天数必须为正整数'); return }
    setSaving(true); setMsg('')
    try {
      await settings.save({ iteration_start_date: startDate, iteration_duration_days: String(days) })
      const cfg = makeIterationConfig(startDate, String(days))
      setIterConfig(cfg)
      setViewCenter(getCurrentIteration(cfg, overrides))
      setMsg('已保存')
      setTimeout(() => setMsg(''), 2000)
    } catch (e: any) { setMsg(e.message || '保存失败') }
    finally { setSaving(false) }
  }

  // Timeline computation
  const currentNum = iterConfig ? getCurrentIteration(iterConfig, overrides) : 1
  const maxAllowed = currentNum + FUTURE_BUFFER
  const safeCenter = Math.max(1, Math.min(maxAllowed, viewCenter ?? currentNum))
  const fromNum = Math.max(1, safeCenter - Math.floor(VIEW_SIZE / 2))
  const toNum = Math.min(maxAllowed, fromNum + VIEW_SIZE - 1)
  const count = toNum - fromNum + 1
  const iters = iterConfig ? computeIterations(fromNum, count, iterConfig, overrides) : []

  const navTimeline = (delta: number) => {
    setViewCenter(Math.max(1, Math.min(maxAllowed, safeCenter + delta)))
  }

  const startEdit = (iter: { num: number; start: string; end: string }) => {
    setEditingIter(iter.num)
    setEditStart(iter.start)
    setEditEnd(iter.end)
    setEditError('')
  }

  const cancelEdit = () => { setEditingIter(null); setEditError('') }

  const saveEdit = async () => {
    if (!editStart || !editEnd) { setEditError('请填写起止日期'); return }
    if (editStart > editEnd) { setEditError('起始日期不能晚于结束日期'); return }
    // Validate start matches previous iter's end + 1
    if (editingIter! > 1 && iterConfig) {
      const prevIters = computeIterations(editingIter! - 1, 1, iterConfig, overrides)
      if (prevIters.length > 0) {
        const prevEnd = new Date(prevIters[0].end + 'T00:00:00')
        const expectedStart = new Date(prevEnd)
        expectedStart.setDate(expectedStart.getDate() + 1)
        const expectedStr = expectedStart.toISOString().slice(0, 10)
        if (editStart !== expectedStr) {
          setEditError(`起始日期应为 ${expectedStr}（上一个 Iteration 结束日期的次日）`)
          return
        }
      }
    }
    try {
      await overridesApi.save(editingIter!, editStart, editEnd)
      setOverrides(prev => ({ ...prev, [editingIter!]: { start: editStart, end: editEnd } }))
      setEditingIter(null)
      setEditError('')
    } catch (e: any) { setEditError(e.message || '保存失败') }
  }

  const removeOverride = async (iterNum: number) => {
    try {
      await overridesApi.delete(iterNum)
      setOverrides(prev => {
        const next = { ...prev }
        delete next[iterNum]
        return next
      })
    } catch (e: any) { console.error(e) }
  }

  const daysBetween = (a: string, b: string) => {
    const ms = new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()
    return Math.round(ms / (1000 * 60 * 60 * 24)) + 1
  }

  const editDays = editStart && editEnd ? daysBetween(editStart, editEnd) : 0

  // Overrides summary
  const overrideNums = Object.keys(overrides).map(Number).sort((a, b) => a - b)

  return (
    <>
      {/* Base config card */}
      <Card title="基础配置">
        <p className="text-sm mb-4" style={{ fontFamily: 'Georgia, serif', color: 'var(--color-ink-muted)' }}>
          设置 Iteration 的起始日期与默认周期天数。每个 Iteration 默认按此规则自动排列。
        </p>
        {loaded && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <label className="font-mono text-xs whitespace-nowrap" style={{ color: 'var(--color-ink-muted)', minWidth: '80px' }}>起始日期</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="font-mono text-sm px-3 py-2 bg-[var(--color-surface-strong)] w-full sm:w-auto"
                style={{ border: '1px solid var(--color-border)', borderRadius: '6px', outline: 'none' }} />
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <label className="font-mono text-xs whitespace-nowrap" style={{ color: 'var(--color-ink-muted)', minWidth: '80px' }}>周期天数</label>
              <input type="number" min="1" value={durationDays} onChange={e => setDurationDays(e.target.value)}
                className="font-mono text-sm px-3 py-2 bg-[var(--color-surface-strong)] w-24"
                style={{ border: '1px solid var(--color-border)', borderRadius: '6px', outline: 'none' }} />
              <span className="font-mono text-xs" style={{ color: 'var(--color-ink-faint)' }}>天</span>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button onClick={saveBase} disabled={saving}
                className="font-mono text-sm px-5 py-2 rounded-md text-[var(--color-solid-text)] transition-colors disabled:opacity-50"
                style={{ background: 'var(--color-solid)', borderRadius: '6px' }}>
                {saving ? '保存中...' : '保存'}
              </button>
              {msg && <span className="font-mono text-sm" style={{ color: msg === '已保存' ? 'var(--color-ink-muted)' : 'var(--color-danger-text)' }}>{msg}</span>}
            </div>
          </div>
        )}
      </Card>

      {/* Timeline card */}
      <Card title="Iteration 时间线">
        <p className="text-sm mb-4" style={{ fontFamily: 'Georgia, serif', color: 'var(--color-ink-muted)' }}>
          遇到节假日等需要调整时，点击「调整」来修改个别 Iteration 的起止日期，后续 Iteration 自动顺延。
        </p>

        {loaded && iterConfig && (
          <>
            {/* Navigation */}
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <button className="font-mono text-xs px-2.5 py-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-hover)]"
                style={{ border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-ink-muted)' }}
                onClick={() => navTimeline(-10)}>« 更早</button>
              <button className="font-mono text-xs px-2 py-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-hover)]"
                style={{ border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-ink-muted)' }}
                onClick={() => navTimeline(-5)}>‹</button>
              <span className="font-mono text-xs" style={{ color: 'var(--color-ink-muted)' }}>Iter {fromNum} – {toNum}</span>
              <button className="font-mono text-xs px-2 py-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-hover)]"
                style={{ border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-ink-muted)' }}
                onClick={() => navTimeline(5)}>›</button>
              <button className="font-mono text-xs px-2.5 py-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-hover)]"
                style={{ border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-ink-muted)' }}
                onClick={() => navTimeline(10)}>更晚 »</button>
              <button className="font-mono text-xs px-2.5 py-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-hover)] ml-auto"
                style={{ border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-ink-muted)' }}
                onClick={() => setViewCenter(currentNum)}>回到当前</button>
            </div>

            {/* Iteration rows */}
            <div className="space-y-1">
              {iters.map(iter => {
                const isCurrent = iter.num === currentNum
                const days = daysBetween(iter.start, iter.end)

                // Edit mode
                if (editingIter === iter.num) {
                  return (
                    <div key={iter.num} className="flex items-center gap-2 p-2.5 rounded-md flex-wrap"
                      style={{ background: 'var(--color-info-bg, #dbeafe)', border: '1px solid var(--color-info-border, #2563eb)', borderRadius: '6px' }}>
                      <span className="font-mono text-sm font-semibold" style={{ minWidth: 64 }}>Iter {iter.num}</span>
                      <span className="font-mono text-xs" style={{ color: 'var(--color-ink-muted)' }}>起始</span>
                      <input type="date" value={editStart} onChange={e => { setEditStart(e.target.value); setEditError('') }}
                        className="font-mono text-xs px-2 py-1 bg-[var(--color-surface)]" style={{ border: '1px solid var(--color-border)', borderRadius: '6px', outline: 'none', width: 140 }} />
                      <span className="font-mono text-xs" style={{ color: 'var(--color-ink-muted)' }}>结束</span>
                      <input type="date" value={editEnd} onChange={e => { setEditEnd(e.target.value); setEditError('') }}
                        className="font-mono text-xs px-2 py-1 bg-[var(--color-surface)]" style={{ border: '1px solid var(--color-border)', borderRadius: '6px', outline: 'none', width: 140 }} />
                      <span className="font-mono text-xs" style={{ color: 'var(--color-ink-faint)' }}>{editDays > 0 ? `${editDays} 天` : '无效'}</span>
                      <div className="flex gap-1.5 ml-auto">
                        <button onClick={saveEdit} className="font-mono text-xs px-3 py-1 rounded-md text-white" style={{ background: '#2563eb', borderRadius: '6px' }}>确认</button>
                        <button onClick={cancelEdit} className="font-mono text-xs px-3 py-1 rounded-md" style={{ border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-ink-muted)' }}>取消</button>
                      </div>
                      {editError && <div className="w-full font-mono text-xs" style={{ color: 'var(--color-danger-text, #dc2626)' }}>{editError}</div>}
                    </div>
                  )
                }

                // Normal row
                return (
                  <div key={iter.num}
                    className="flex items-center gap-2 px-3 py-2 rounded-md transition-colors hover:bg-[var(--color-surface-hover)]"
                    style={{
                      ...(isCurrent ? { background: 'var(--color-surface)', border: '1px solid var(--color-border-strong, #ccc)', borderRadius: '6px' } : {}),
                      ...(iter.isOverride && !isCurrent ? { background: '#f0fdf4', borderRadius: '6px' } : {}),
                    }}>
                    <span className="font-mono text-sm font-semibold" style={{ minWidth: 64, color: 'var(--color-ink)' }}>Iter {iter.num}</span>
                    <span className="font-mono text-xs" style={{ color: 'var(--color-ink-secondary)', minWidth: 160 }}>{iter.start} ~ {iter.end}</span>
                    <span className="font-mono text-xs hidden sm:inline" style={{ color: 'var(--color-ink-faint)', minWidth: 40 }}>{days} 天</span>
                    {isCurrent && (
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--color-solid)', color: 'var(--color-solid-text)', borderRadius: '4px' }}>当前</span>
                    )}
                    {iter.isOverride && (
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#bbf7d0', color: '#166534', borderRadius: '4px' }}>已调整</span>
                    )}
                    <div className="flex gap-1 ml-auto">
                      <button onClick={() => startEdit(iter)}
                        className="font-mono text-xs px-2.5 py-1 rounded-md transition-colors hover:bg-[var(--color-surface-hover)]"
                        style={{ border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-ink-muted)' }}>调整</button>
                      {iter.isOverride && (
                        <button onClick={() => removeOverride(iter.num)}
                          className="font-mono text-xs px-2.5 py-1 rounded-md transition-colors"
                          style={{ border: '1px solid var(--color-danger-border, #fca5a5)', borderRadius: '6px', color: 'var(--color-danger-text, #dc2626)' }}>还原</button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </Card>

      {/* Overrides summary card */}
      {overrideNums.length > 0 && (
        <Card title="已调整的 Iteration">
          <p className="text-sm mb-3" style={{ fontFamily: 'Georgia, serif', color: 'var(--color-ink-muted)' }}>
            共 {overrideNums.length} 个 Iteration 已手动调整起止日期：
          </p>
          <div className="space-y-1.5">
            {overrideNums.map(n => {
              const o = overrides[n]
              const days = daysBetween(o.start, o.end)
              const defaultDays = parseInt(durationDays, 10) || 14
              const diff = days - defaultDays
              return (
                <div key={n} className="flex items-center gap-2 font-mono text-xs py-1">
                  <span style={{ minWidth: 56, fontWeight: 600 }}>Iter {n}</span>
                  <span style={{ color: 'var(--color-ink-secondary)' }}>{o.start} ~ {o.end}</span>
                  <span style={{ color: 'var(--color-ink-faint)' }}>{days}天</span>
                  {diff !== 0 && <span style={{ color: diff > 0 ? '#166534' : 'var(--color-danger-text, #dc2626)', fontSize: 11 }}>{diff > 0 ? '+' : ''}{diff}天</span>}
                  <button onClick={() => setViewCenter(n)} className="ml-auto font-mono text-xs px-2 py-0.5 rounded-md"
                    style={{ border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-ink-muted)' }}>查看</button>
                  <button onClick={() => removeOverride(n)} className="font-mono text-xs px-2 py-0.5 rounded-md"
                    style={{ border: '1px solid var(--color-danger-border, #fca5a5)', borderRadius: '6px', color: 'var(--color-danger-text, #dc2626)' }}>删除</button>
                </div>
              )
            })}
          </div>
        </Card>
      )}
    </>
  )
}

/* ── Kanban URL ──────────────────────────────────────── */

function KanbanUrlSection() {
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
    } catch (e: any) {
      setMsg(e.message || '保存失败')
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

/* ── Passkeys ───────────────────────────────────────── */

function PasskeySection() {
  const [passkeyList, setPasskeyList] = useState<Passkey[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [adding, setAdding] = useState(false)
  const [msg, setMsg] = useState('')
  const [isError, setIsError] = useState(false)

  const loadPasskeys = async () => {
    try {
      const data = await passkeysApi.list()
      setPasskeyList(data.passkeys)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPasskeys()
  }, [])

  const handleAdd = async () => {
    if (!name.trim()) {
      setMsg('请输入通行密钥名称')
      setIsError(true)
      return
    }
    setAdding(true)
    setMsg('')
    try {
      const options = await passkeysApi.registerBegin()

      const publicKeyOptions: PublicKeyCredentialCreationOptions = {
        challenge: base64urlToBuffer(options.challenge),
        rp: options.rp,
        user: {
          id: base64urlToBuffer(options.user.id),
          name: options.user.name,
          displayName: options.user.displayName,
        },
        pubKeyCredParams: options.pubKeyCredParams.map((p) => ({
          type: 'public-key' as const,
          alg: p.alg,
        })),
        authenticatorSelection: {
          authenticatorAttachment: options.authenticatorSelection.authenticatorAttachment as AuthenticatorAttachment | undefined,
          residentKey: (options.authenticatorSelection.residentKey || 'preferred') as ResidentKeyRequirement,
          userVerification: (options.authenticatorSelection.userVerification || 'preferred') as UserVerificationRequirement,
        },
        timeout: options.timeout,
        attestation: (options.attestation || 'none') as AttestationConveyancePreference,
        excludeCredentials: options.excludeCredentials.map((c) => ({
          type: 'public-key' as const,
          id: base64urlToBuffer(c.id),
        })),
      }

      const credential = (await navigator.credentials.create({
        publicKey: publicKeyOptions,
      })) as PublicKeyCredential | null

      if (!credential) {
        setMsg('创建通行密钥已取消')
        setIsError(true)
        setAdding(false)
        return
      }

      await passkeysApi.registerFinish(name.trim(), credential)
      setMsg('通行密钥已添加')
      setIsError(false)
      setName('')
      await loadPasskeys()
    } catch (e: any) {
      setMsg(e.message || '添加通行密钥失败')
      setIsError(true)
    } finally {
      setAdding(false)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await passkeysApi.delete(id)
      setPasskeyList((prev) => prev.filter((p) => p.id !== id))
      setMsg('通行密钥已删除')
      setIsError(false)
    } catch (e: any) {
      setMsg(e.message || '删除失败')
      setIsError(true)
    }
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '从未使用'
    const d = new Date(dateStr.replace(' ', 'T') + 'Z')
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' })
  }

  return (
    <Card title="通行密钥">
      <p className="text-sm mb-4" style={{ fontFamily: 'Georgia, serif', color: 'var(--color-ink-muted)' }}>
        通行密钥让你无需输入密码即可登录，支持指纹、面容识别等方式。
      </p>

      {loading ? (
        <p className="font-mono text-sm" style={{ color: 'var(--color-ink-muted)' }}>加载中...</p>
      ) : (
        <>
          {passkeyList.length > 0 && (
            <div className="space-y-3 mb-4">
              {passkeyList.map((pk) => (
                <div
                  key={pk.id}
                  className="flex items-center justify-between py-2.5 px-3 rounded-md"
                  style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                >
                  <div>
                    <div className="font-mono text-sm font-semibold" style={{ color: 'var(--color-ink)' }}>
                      {pk.name}
                    </div>
                    <div className="font-mono text-xs" style={{ color: 'var(--color-ink-muted)' }}>
                      添加于 {formatDate(pk.created_at)} · 上次使用 {formatDate(pk.last_used_at)}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(pk.id)}
                    className="font-mono text-sm px-3 py-1 rounded-md transition-colors"
                    style={{
                      color: 'var(--color-danger-text)',
                      border: '1px solid var(--color-danger-border)',
                      borderRadius: '6px',
                    }}
                  >
                    删除
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="通行密钥名称（如 MacBook、iPhone）"
              className="font-mono text-sm px-3 py-2 bg-[var(--color-surface-strong)] w-full sm:w-72"
              style={{ border: '1px solid var(--color-border)', borderRadius: '6px', outline: 'none' }}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
            <button
              onClick={handleAdd}
              disabled={adding}
              className="font-mono text-sm px-5 py-2 rounded-md text-[var(--color-solid-text)] transition-colors disabled:opacity-50"
              style={{ background: 'var(--color-solid)', borderRadius: '6px' }}
            >
              {adding ? '添加中...' : '添加通行密钥'}
            </button>
          </div>

          {msg && (
            <p className="font-mono text-sm mt-3" style={{ color: isError ? 'var(--color-danger-text)' : 'var(--color-ink-muted)' }}>
              {msg}
            </p>
          )}
        </>
      )}
    </Card>
  )
}

/* ── Change Password ────────────────────────────────── */

function PasswordSection() {
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [isError, setIsError] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setMsg('')

    if (newPw.length < 6) {
      setMsg('新密码至少需要 6 个字符')
      setIsError(true)
      return
    }
    if (newPw !== confirmPw) {
      setMsg('两次输入的新密码不一致')
      setIsError(true)
      return
    }

    setSaving(true)
    try {
      await settings.changePassword(oldPw, newPw)
      setMsg('密码已修改')
      setIsError(false)
      setOldPw('')
      setNewPw('')
      setConfirmPw('')
    } catch (e: any) {
      setMsg(e.message || '修改失败')
      setIsError(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card title="修改密码">
      <form onSubmit={submit} className="space-y-3 max-w-sm">
        <InputField
          label="当前密码"
          type="password"
          value={oldPw}
          onChange={setOldPw}
          placeholder="输入当前密码"
        />
        <InputField
          label="新密码"
          type="password"
          value={newPw}
          onChange={setNewPw}
          placeholder="至少 6 个字符"
        />
        <InputField
          label="确认新密码"
          type="password"
          value={confirmPw}
          onChange={setConfirmPw}
          placeholder="再次输入新密码"
        />
        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={saving}
            className="font-mono text-sm px-5 py-2 rounded-md text-[var(--color-solid-text)] transition-colors disabled:opacity-50"
            style={{ background: 'var(--color-solid)', borderRadius: '6px' }}
          >
            {saving ? '修改中...' : '修改密码'}
          </button>
          {msg && (
            <span className="font-mono text-sm" style={{ color: isError ? 'var(--color-danger-text)' : 'var(--color-ink-muted)' }}>
              {msg}
            </span>
          )}
        </div>
      </form>
    </Card>
  )
}

/* ── Export / Import ────────────────────────────────── */

function DataSection() {
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [msg, setMsg] = useState('')
  const [isError, setIsError] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

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
      setMsg('导出成功')
      setIsError(false)
    } catch (e: any) {
      setMsg(e.message || '导出失败')
      setIsError(true)
    } finally {
      setExporting(false)
    }
  }

  const handleImport = () => {
    fileRef.current?.click()
  }

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImporting(true)
    setMsg('')
    try {
      const result = await settings.importData(file)
      const parts = []
      if (result.attendance_count) parts.push(`${result.attendance_count} 条考勤`)
      if (result.work_log_count) parts.push(`${result.work_log_count} 条工作日志`)
      setMsg(`导入成功：${parts.join('，') || '无新数据'}`)
      setIsError(false)
    } catch (e: any) {
      setMsg(e.message || '导入失败')
      setIsError(true)
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <Card title="数据管理">
      <p className="text-sm mb-4" style={{ fontFamily: 'Georgia, serif', color: 'var(--color-ink-muted)' }}>
        导出所有考勤、工作日志和待办等数据为 ZIP 压缩包，或从 ZIP 文件导入数据。
      </p>
      <div className="flex flex-col sm:flex-row items-start gap-3">
        <button
          onClick={handleExport}
          disabled={exporting}
          className="font-mono text-sm px-5 py-2 rounded-md text-[var(--color-solid-text)] transition-colors disabled:opacity-50"
          style={{ background: 'var(--color-solid)', borderRadius: '6px' }}
        >
          {exporting ? '导出中...' : '↓ 导出数据'}
        </button>
        <button
          onClick={handleImport}
          disabled={importing}
          className="font-mono text-sm px-5 py-2 rounded-md bg-[var(--color-surface-strong)] transition-colors hover:bg-[var(--color-surface-hover)] disabled:opacity-50"
          style={{ border: '1px solid var(--color-border)', borderRadius: '6px' }}
        >
          {importing ? '导入中...' : '↑ 导入数据'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".zip"
          onChange={onFileChange}
          className="hidden"
        />
      </div>
      {msg && (
        <p className="font-mono text-sm mt-3" style={{ color: isError ? 'var(--color-danger-text)' : 'var(--color-ink-muted)' }}>
          {msg}
        </p>
      )}
    </Card>
  )
}

/* ── Delete All Data ─────────────────────────────────── */

function DeleteDataSection() {
  const [step, setStep] = useState<'idle' | 'confirm' | 'password'>('idle')
  const [password, setPassword] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [msg, setMsg] = useState('')
  const [isError, setIsError] = useState(false)

  const handleDelete = async () => {
    if (!password) {
      setMsg('请输入密码')
      setIsError(true)
      return
    }
    setDeleting(true)
    setMsg('')
    try {
      const result = await settings.deleteData(password)
      const parts = []
      if (result.attendance_count) parts.push(`${result.attendance_count} 条考勤`)
      if (result.work_log_count) parts.push(`${result.work_log_count} 条工作日志`)
      if (result.lesson_count) parts.push(`${result.lesson_count} 条经验教训`)
      if (result.todo_count) parts.push(`${result.todo_count} 条待办`)
      setMsg(`已删除：${parts.join('，') || '无数据'}`)
      setIsError(false)
      setStep('idle')
      setPassword('')
    } catch (e: any) {
      setMsg(e.message || '删除失败')
      setIsError(true)
    } finally {
      setDeleting(false)
    }
  }

  const cancel = () => {
    setStep('idle')
    setPassword('')
    setMsg('')
  }

  return (
    <Card title="危险操作">
      <p className="text-sm mb-4" style={{ fontFamily: 'Georgia, serif', color: 'var(--color-danger-text)' }}>
        删除所有数据（考勤、工作日志、经验教训、待办事项），此操作不可恢复。
      </p>

      {step === 'idle' && (
        <button
          onClick={() => setStep('confirm')}
          className="font-mono text-sm px-5 py-2 rounded-md text-[var(--color-solid-text)] transition-colors"
          style={{ background: 'var(--color-danger)', borderRadius: '6px' }}
        >
          🗑 删除所有数据
        </button>
      )}

      {step === 'confirm' && (
        <div className="rounded-lg p-4" style={{ background: 'var(--color-danger-bg)', border: '1px solid var(--color-danger-border)' }}>
          <p className="font-mono text-sm font-semibold mb-3" style={{ color: 'var(--color-danger-strong)' }}>
            ⚠️ 确认删除所有数据？此操作不可撤销！
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setStep('password')}
              className="font-mono text-sm px-5 py-2 rounded-md text-[var(--color-solid-text)] transition-colors"
              style={{ background: 'var(--color-danger)', borderRadius: '6px' }}
            >
              确认删除
            </button>
            <button
              onClick={cancel}
              className="font-mono text-sm px-5 py-2 rounded-md bg-[var(--color-surface-strong)] transition-colors hover:bg-[var(--color-surface-hover)]"
              style={{ border: '1px solid var(--color-border)', borderRadius: '6px' }}
            >
              取消
            </button>
          </div>
        </div>
      )}

      {step === 'password' && (
        <div className="rounded-lg p-4" style={{ background: 'var(--color-danger-bg)', border: '1px solid var(--color-danger-border)' }}>
          <p className="font-mono text-sm font-semibold mb-3" style={{ color: 'var(--color-danger-strong)' }}>
            🔒 请输入账号密码以确认删除
          </p>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="输入密码"
              className="font-mono text-sm px-3 py-2 bg-[var(--color-surface-strong)] w-full sm:w-64"
              style={{ border: '1px solid var(--color-border)', borderRadius: '6px', outline: 'none' }}
              onKeyDown={e => e.key === 'Enter' && handleDelete()}
              autoFocus
            />
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="font-mono text-sm px-5 py-2 rounded-md text-[var(--color-solid-text)] transition-colors disabled:opacity-50"
              style={{ background: 'var(--color-danger)', borderRadius: '6px' }}
            >
              {deleting ? '删除中...' : '确认删除'}
            </button>
            <button
              onClick={cancel}
              className="font-mono text-sm px-5 py-2 rounded-md bg-[var(--color-surface-strong)] transition-colors hover:bg-[var(--color-surface-hover)]"
              style={{ border: '1px solid var(--color-border)', borderRadius: '6px' }}
            >
              取消
            </button>
          </div>
        </div>
      )}

      {msg && (
        <p className="font-mono text-sm mt-3" style={{ color: isError ? 'var(--color-danger-text)' : 'var(--color-ink-muted)' }}>
          {msg}
        </p>
      )}
    </Card>
  )
}

/* ── Version Info ─────────────────────────────────────── */

function VersionSection() {
  const [version, setVersion] = useState<{ commit: string; date: string; content: string } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    system.version().then(data => {
      setVersion(data)
    }).catch(() => {
      // ignore
    }).finally(() => {
      setLoading(false)
    })
  }, [])

  return (
    <Card title="关于系统">
      <p className="text-sm mb-4" style={{ fontFamily: 'Georgia, serif', color: 'var(--color-ink-muted)' }}>
        当前部署的系统版本信息。
      </p>
      {loading ? (
        <p className="font-mono text-sm" style={{ color: 'var(--color-ink-muted)' }}>加载中...</p>
      ) : version ? (
        <div className="space-y-2 font-mono text-sm">
          <div className="flex flex-col sm:flex-row sm:gap-4">
            <span style={{ color: 'var(--color-ink-muted)', minWidth: '80px' }}>更新日期</span>
            <span style={{ color: 'var(--color-ink)' }}>{version.date}</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:gap-4">
            <span style={{ color: 'var(--color-ink-muted)', minWidth: '80px' }}>更新 Commit</span>
            <span style={{ color: 'var(--color-ink)' }}>{version.commit}</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:gap-4">
            <span style={{ color: 'var(--color-ink-muted)', minWidth: '80px' }}>更新内容</span>
            <span style={{ color: 'var(--color-ink)' }}>{version.content}</span>
          </div>
        </div>
      ) : (
        <p className="font-mono text-sm" style={{ color: 'var(--color-ink-muted)' }}>未知版本</p>
      )}
    </Card>
  )
}

/* ── Shared Components ──────────────────────────────── */

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-lg p-5 sm:p-6"
      style={{
        background: 'var(--color-surface-strong)',
        border: '1px solid var(--color-border)',
        borderRadius: '8px',
      }}
    >
      <h2 className="font-mono text-xs uppercase tracking-[0.2em] mb-4" style={{ color: 'var(--color-ink-secondary)' }}>
        {title}
      </h2>
      {children}
    </div>
  )
}

function InputField({
  label,
  type,
  value,
  onChange,
  placeholder,
}: {
  label: string
  type: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div>
      <label className="block font-mono text-xs mb-1" style={{ color: 'var(--color-ink-muted)' }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="font-mono text-sm w-full px-3 py-2 bg-[var(--color-surface-strong)]"
        style={{ border: '1px solid var(--color-border)', borderRadius: '6px', outline: 'none' }}
      />
    </div>
  )
}

function LoadingScreen() {
  return (
    <main className="max-w-5xl mx-auto px-4 py-16 text-center">
      <p className="font-mono text-sm" style={{ color: 'var(--color-ink-muted)' }}>
        加载中...
      </p>
    </main>
  )
}
