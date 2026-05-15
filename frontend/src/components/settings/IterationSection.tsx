import { useState, useEffect } from 'react'
import { settings, iterationOverrides as overridesApi } from '../../lib/api'
import {
  makeIterationConfig,
  getCurrentIteration,
  computeIterations,
  type IterationConfig,
  type IterationOverrideMap,
} from '../../lib/date-utils'
import { Card } from '../../components/Card'

const VIEW_SIZE = 10
const FUTURE_BUFFER = 2

export function IterationSection() {
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
      setViewCenter(prev => {
        if (prev === null) return getCurrentIteration(cfg, ovMap)
        return prev
      })
      setLoaded(true)
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  const saveBase = async () => {
    const d = new Date(startDate + 'T00:00:00')
    if (isNaN(d.getTime())) {
      setMsg('起始日期格式无效')
      return
    }
    const days = parseInt(durationDays, 10)
    if (isNaN(days) || days < 1) {
      setMsg('天数必须为正整数')
      return
    }
    setSaving(true)
    setMsg('')
    try {
      await settings.save({ iteration_start_date: startDate, iteration_duration_days: String(days) })
      const cfg = makeIterationConfig(startDate, String(days))
      setIterConfig(cfg)
      setViewCenter(getCurrentIteration(cfg, overrides))
      setMsg('已保存')
      setTimeout(() => setMsg(''), 2000)
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

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

  const cancelEdit = () => {
    setEditingIter(null)
    setEditError('')
  }

  const saveEdit = async () => {
    if (!editStart || !editEnd) {
      setEditError('请填写起止日期')
      return
    }
    if (editStart > editEnd) {
      setEditError('起始日期不能晚于结束日期')
      return
    }
    try {
      await overridesApi.save(editingIter!, editStart, editEnd)
      setOverrides(prev => ({ ...prev, [editingIter!]: { start: editStart, end: editEnd } }))
      setEditingIter(null)
      setEditError('')
    } catch (e: unknown) {
      setEditError(e instanceof Error ? e.message : '保存失败')
    }
  }

  const removeOverride = async (iterNum: number) => {
    try {
      await overridesApi.delete(iterNum)
      setOverrides(prev => {
        const next = { ...prev }
        delete next[iterNum]
        return next
      })
    } catch (e: unknown) {
      console.error(e)
    }
  }

  const daysBetween = (a: string, b: string) => {
    const ms = new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()
    return Math.round(ms / (1000 * 60 * 60 * 24)) + 1
  }

  const editDays = editStart && editEnd ? daysBetween(editStart, editEnd) : 0

  const overrideNums = Object.keys(overrides).map(Number).sort((a, b) => a - b)

  return (
    <>
      <Card title="基础配置">
        <p className="text-sm mb-4" style={{ fontFamily: 'Georgia, serif', color: 'var(--color-ink-muted)' }}>
          设置 Iteration 的起始日期与默认周期天数。每个 Iteration 默认按此规则自动排列。
        </p>
        {loaded && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <label className="font-mono text-xs whitespace-nowrap" style={{ color: 'var(--color-ink-muted)', minWidth: '80px' }}>
                起始日期
              </label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="font-mono text-sm px-3 py-2 bg-[var(--color-surface-strong)] w-full sm:w-auto"
                style={{ border: '1px solid var(--color-border)', borderRadius: '6px', outline: 'none' }}
              />
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <label className="font-mono text-xs whitespace-nowrap" style={{ color: 'var(--color-ink-muted)', minWidth: '80px' }}>
                周期天数
              </label>
              <input
                type="number"
                min="1"
                value={durationDays}
                onChange={e => setDurationDays(e.target.value)}
                className="font-mono text-sm px-3 py-2 bg-[var(--color-surface-strong)] w-24"
                style={{ border: '1px solid var(--color-border)', borderRadius: '6px', outline: 'none' }}
              />
              <span className="font-mono text-xs" style={{ color: 'var(--color-ink-faint)' }}>
                天
              </span>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={saveBase}
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
          </div>
        )}
      </Card>

      <Card title="Iteration 时间线">
        <p className="text-sm mb-4" style={{ fontFamily: 'Georgia, serif', color: 'var(--color-ink-muted)' }}>
          遇到节假日等需要调整时，点击「调整」来修改个别 Iteration 的起止日期，后续 Iteration 自动顺延。
        </p>

        {loaded && iterConfig && (
          <>
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <button
                className="font-mono text-xs px-2.5 py-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-hover)]"
                style={{ border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-ink-muted)' }}
                onClick={() => navTimeline(-10)}
              >
                « 更早
              </button>
              <button
                className="font-mono text-xs px-2 py-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-hover)]"
                style={{ border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-ink-muted)' }}
                onClick={() => navTimeline(-5)}
              >
                ‹
              </button>
              <span className="font-mono text-xs" style={{ color: 'var(--color-ink-muted)' }}>
                Iter {fromNum} – {toNum}
              </span>
              <button
                className="font-mono text-xs px-2 py-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-hover)]"
                style={{ border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-ink-muted)' }}
                onClick={() => navTimeline(5)}
              >
                ›
              </button>
              <button
                className="font-mono text-xs px-2.5 py-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-hover)]"
                style={{ border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-ink-muted)' }}
                onClick={() => navTimeline(10)}
              >
                更晚 »
              </button>
              <button
                className="font-mono text-xs px-2.5 py-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-hover)] ml-auto"
                style={{ border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-ink-muted)' }}
                onClick={() => setViewCenter(currentNum)}
              >
                回到当前
              </button>
            </div>

            <div className="space-y-1">
              {iters.map(iter => {
                const isCurrent = iter.num === currentNum
                const days = daysBetween(iter.start, iter.end)

                if (editingIter === iter.num) {
                  return (
                    <div
                      key={iter.num}
                      className="flex items-center gap-2 p-2.5 rounded-md flex-wrap"
                      style={{
                        background: 'var(--color-info-bg, #dbeafe)',
                        border: '1px solid var(--color-info-border, #2563eb)',
                        borderRadius: '6px',
                      }}
                    >
                      <span className="font-mono text-sm font-semibold" style={{ minWidth: 64 }}>
                        Iter {iter.num}
                      </span>
                      <span className="font-mono text-xs" style={{ color: 'var(--color-ink-muted)' }}>
                        起始
                      </span>
                      <input
                        type="date"
                        value={editStart}
                        onChange={e => {
                          setEditStart(e.target.value)
                          setEditError('')
                        }}
                        className="font-mono text-xs px-2 py-1 bg-[var(--color-surface)]"
                        style={{ border: '1px solid var(--color-border)', borderRadius: '6px', outline: 'none', width: 140 }}
                      />
                      <span className="font-mono text-xs" style={{ color: 'var(--color-ink-muted)' }}>
                        结束
                      </span>
                      <input
                        type="date"
                        value={editEnd}
                        onChange={e => {
                          setEditEnd(e.target.value)
                          setEditError('')
                        }}
                        className="font-mono text-xs px-2 py-1 bg-[var(--color-surface)]"
                        style={{ border: '1px solid var(--color-border)', borderRadius: '6px', outline: 'none', width: 140 }}
                      />
                      <span className="font-mono text-xs" style={{ color: 'var(--color-ink-faint)' }}>
                        {editDays > 0 ? `${editDays} 天` : '无效'}
                      </span>
                      <div className="flex gap-1.5 ml-auto">
                        <button
                          onClick={saveEdit}
                          className="font-mono text-xs px-3 py-1 rounded-md text-white"
                          style={{ background: '#2563eb', borderRadius: '6px' }}
                        >
                          确认
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="font-mono text-xs px-3 py-1 rounded-md"
                          style={{ border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-ink-muted)' }}
                        >
                          取消
                        </button>
                      </div>
                      {editError && (
                        <div className="w-full font-mono text-xs" style={{ color: 'var(--color-danger-text, #dc2626)' }}>
                          {editError}
                        </div>
                      )}
                    </div>
                  )
                }

                return (
                  <div
                    key={iter.num}
                    className="flex items-center gap-2 px-3 py-2 rounded-md transition-colors hover:bg-[var(--color-surface-hover)]"
                    style={{
                      ...(isCurrent
                        ? { background: 'var(--color-surface)', border: '1px solid var(--color-border-strong, #ccc)', borderRadius: '6px' }
                        : {}),
                      ...(iter.isOverride && !isCurrent ? { background: '#f0fdf4', borderRadius: '6px' } : {}),
                    }}
                  >
                    <span className="font-mono text-sm font-semibold" style={{ minWidth: 64, color: 'var(--color-ink)' }}>
                      Iter {iter.num}
                    </span>
                    <span className="font-mono text-xs" style={{ color: 'var(--color-ink-secondary)', minWidth: 160 }}>
                      {iter.start} ~ {iter.end}
                    </span>
                    <span className="font-mono text-xs hidden sm:inline" style={{ color: 'var(--color-ink-faint)', minWidth: 40 }}>
                      {days} 天
                    </span>
                    {isCurrent && (
                      <span
                        className="font-mono text-[10px] px-1.5 py-0.5 rounded"
                        style={{ background: 'var(--color-solid)', color: 'var(--color-solid-text)', borderRadius: '4px' }}
                      >
                        当前
                      </span>
                    )}
                    {iter.isOverride && (
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#bbf7d0', color: '#166534', borderRadius: '4px' }}>
                        已调整
                      </span>
                    )}
                    <div className="flex gap-1 ml-auto">
                      <button
                        onClick={() => startEdit(iter)}
                        className="font-mono text-xs px-2.5 py-1 rounded-md transition-colors hover:bg-[var(--color-surface-hover)]"
                        style={{ border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-ink-muted)' }}
                      >
                        调整
                      </button>
                      {iter.isOverride && (
                        <button
                          onClick={() => removeOverride(iter.num)}
                          className="font-mono text-xs px-2.5 py-1 rounded-md transition-colors"
                          style={{
                            border: '1px solid var(--color-danger-border, #fca5a5)',
                            borderRadius: '6px',
                            color: 'var(--color-danger-text, #dc2626)',
                          }}
                        >
                          还原
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </Card>

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
                  <span style={{ color: 'var(--color-ink-secondary)' }}>
                    {o.start} ~ {o.end}
                  </span>
                  <span style={{ color: 'var(--color-ink-faint)' }}>{days}天</span>
                  {diff !== 0 && (
                    <span style={{ color: diff > 0 ? '#166534' : 'var(--color-danger-text, #dc2626)', fontSize: 11 }}>
                      {diff > 0 ? '+' : ''}
                      {diff}天
                    </span>
                  )}
                  <button
                    onClick={() => setViewCenter(n)}
                    className="ml-auto font-mono text-xs px-2 py-0.5 rounded-md"
                    style={{ border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-ink-muted)' }}
                  >
                    查看
                  </button>
                  <button
                    onClick={() => removeOverride(n)}
                    className="font-mono text-xs px-2 py-0.5 rounded-md"
                    style={{
                      border: '1px solid var(--color-danger-border, #fca5a5)',
                      borderRadius: '6px',
                      color: 'var(--color-danger-text, #dc2626)',
                    }}
                  >
                    删除
                  </button>
                </div>
              )
            })}
          </div>
        </Card>
      )}
    </>
  )
}
