import { useState, useEffect, useMemo } from 'react'
import {
  makeIterationConfig,
  getCurrentIteration,
  computeIterations,
  type IterationConfig,
  type IterationOverrideMap,
} from '../../lib/date-utils'
import { Card } from '../../components/Card'
import {
  useSettings, useSaveSettings,
  useIterationOverrides, useSaveIterationOverride, useDeleteIterationOverride,
} from '../../lib/queries'

const VIEW_SIZE = 10
const FUTURE_BUFFER = 2

export function IterationSection() {
  const [startDate, setStartDate] = useState('2019-09-02')
  const [durationDays, setDurationDays] = useState('14')
  const [msg, setMsg] = useState('')
  const [viewCenter, setViewCenter] = useState<number | null>(null)
  const [editingIter, setEditingIter] = useState<number | null>(null)
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')
  const [editError, setEditError] = useState('')

  const { data: settingsData, isSuccess: settingsLoaded } = useSettings()
  const { data: ovData, isSuccess: ovLoaded } = useIterationOverrides()
  const saveSettingsMut = useSaveSettings()
  const saveOverrideMut = useSaveIterationOverride()
  const deleteOverrideMut = useDeleteIterationOverride()

  const loaded = settingsLoaded && ovLoaded

  // 从 query 数据派生 iterConfig 和 overrides map
  const overrides = useMemo<IterationOverrideMap>(() => {
    if (!ovData) return {}
    const map: IterationOverrideMap = {}
    for (const o of ovData.overrides) {
      map[o.iteration_number] = { start: o.start_date, end: o.end_date }
    }
    return map
  }, [ovData])

  const iterConfig = useMemo<IterationConfig | null>(() => {
    if (!settingsData) return null
    const sd = settingsData.iteration_start_date || '2019-09-02'
    const dd = settingsData.iteration_duration_days || '14'
    return makeIterationConfig(sd, dd)
  }, [settingsData])

  // 服务端数据到达后同步本地表单状态
  useEffect(() => {
    if (settingsData) {
      setStartDate(settingsData.iteration_start_date || '2019-09-02')
      setDurationDays(settingsData.iteration_duration_days || '14')
    }
  }, [settingsData])

  useEffect(() => {
    if (iterConfig && viewCenter === null) {
      setViewCenter(getCurrentIteration(iterConfig, overrides))
    }
  }, [iterConfig, overrides, viewCenter])

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
    setMsg('')
    try {
      await saveSettingsMut.mutateAsync({ iteration_start_date: startDate, iteration_duration_days: String(days) })
      const cfg = makeIterationConfig(startDate, String(days))
      setViewCenter(getCurrentIteration(cfg, overrides))
      setMsg('已保存')
      setTimeout(() => setMsg(''), 2000)
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : '保存失败')
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
      await saveOverrideMut.mutateAsync({
        iterationNumber: editingIter!,
        startDate: editStart,
        endDate: editEnd,
      })
      setEditingIter(null)
      setEditError('')
    } catch (e: unknown) {
      setEditError(e instanceof Error ? e.message : '保存失败')
    }
  }

  const removeOverride = async (iterNum: number) => {
    try {
      await deleteOverrideMut.mutateAsync(iterNum)
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
        <p className="text-sm mb-4 font-serif text-[var(--color-ink-muted)]">
          设置 Iteration 的起始日期与默认周期天数。每个 Iteration 默认按此规则自动排列。
        </p>
        {loaded && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <label className="font-mono text-xs whitespace-nowrap text-[var(--color-ink-muted)] min-w-[80px]">
                起始日期
              </label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="font-mono text-sm px-3 py-2 bg-[var(--color-surface-strong)] w-full sm:w-auto border border-[var(--color-border)] rounded-md outline-none"
              />
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <label className="font-mono text-xs whitespace-nowrap text-[var(--color-ink-muted)] min-w-[80px]">
                周期天数
              </label>
              <input
                type="number"
                min="1"
                value={durationDays}
                onChange={e => setDurationDays(e.target.value)}
                className="font-mono text-sm px-3 py-2 bg-[var(--color-surface-strong)] w-24 border border-[var(--color-border)] rounded-md outline-none"
              />
              <span className="font-mono text-xs text-[var(--color-ink-faint)]">
                天
              </span>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={saveBase}
                disabled={saveSettingsMut.isPending}
                className="font-mono text-sm px-5 py-2 rounded-md text-[var(--color-solid-text)] transition-colors disabled:opacity-50 bg-[var(--color-solid)]"
              >
                {saveSettingsMut.isPending ? '保存中...' : '保存'}
              </button>
              {msg && (
                <span
                  className={`font-mono text-sm ${msg === '已保存' ? 'text-[var(--color-ink-muted)]' : 'text-[var(--color-danger-text)]'}`}
                >
                  {msg}
                </span>
              )}
            </div>
          </div>
        )}
      </Card>

      <Card title="Iteration 时间线">
        <p className="text-sm mb-4 font-serif text-[var(--color-ink-muted)]">
          遇到节假日等需要调整时，点击「调整」来修改个别 Iteration 的起止日期，后续 Iteration 自动顺延。
        </p>

        {loaded && iterConfig && (
          <>
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <button
                className="font-mono text-xs px-2.5 py-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-hover)] border border-[var(--color-border)] text-[var(--color-ink-muted)]"
                onClick={() => navTimeline(-10)}
              >
                « 更早
              </button>
              <button
                className="font-mono text-xs px-2 py-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-hover)] border border-[var(--color-border)] text-[var(--color-ink-muted)]"
                onClick={() => navTimeline(-5)}
              >
                ‹
              </button>
              <span className="font-mono text-xs text-[var(--color-ink-muted)]">
                Iter {fromNum} – {toNum}
              </span>
              <button
                className="font-mono text-xs px-2 py-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-hover)] border border-[var(--color-border)] text-[var(--color-ink-muted)]"
                onClick={() => navTimeline(5)}
              >
                ›
              </button>
              <button
                className="font-mono text-xs px-2.5 py-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-hover)] border border-[var(--color-border)] text-[var(--color-ink-muted)]"
                onClick={() => navTimeline(10)}
              >
                更晚 »
              </button>
              <button
                className="font-mono text-xs px-2.5 py-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-hover)] ml-auto border border-[var(--color-border)] text-[var(--color-ink-muted)]"
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
                      className="flex items-center gap-2 p-2.5 rounded-md flex-wrap bg-[var(--color-info-bg,#dbeafe)] border border-[var(--color-info-border,#2563eb)]"
                    >
                      <span className="font-mono text-sm font-semibold min-w-16">
                        Iter {iter.num}
                      </span>
                      <span className="font-mono text-xs text-[var(--color-ink-muted)]">
                        起始
                      </span>
                      <input
                        type="date"
                        value={editStart}
                        onChange={e => {
                          setEditStart(e.target.value)
                          setEditError('')
                        }}
                        className="font-mono text-xs px-2 py-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md outline-none w-[140px]"
                      />
                      <span className="font-mono text-xs text-[var(--color-ink-muted)]">
                        结束
                      </span>
                      <input
                        type="date"
                        value={editEnd}
                        onChange={e => {
                          setEditEnd(e.target.value)
                          setEditError('')
                        }}
                        className="font-mono text-xs px-2 py-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md outline-none w-[140px]"
                      />
                      <span className="font-mono text-xs text-[var(--color-ink-faint)]">
                        {editDays > 0 ? `${editDays} 天` : '无效'}
                      </span>
                      <div className="flex gap-1.5 ml-auto">
                        <button
                          onClick={saveEdit}
                          className="font-mono text-xs px-3 py-1 rounded-md text-white bg-[#2563eb]"
                        >
                          确认
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="font-mono text-xs px-3 py-1 rounded-md border border-[var(--color-border)] text-[var(--color-ink-muted)]"
                        >
                          取消
                        </button>
                      </div>
                      {editError && (
                        <div className="w-full font-mono text-xs text-[var(--color-danger-text,#dc2626)]">
                          {editError}
                        </div>
                      )}
                    </div>
                  )
                }

                return (
                  <div
                    key={iter.num}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors hover:bg-[var(--color-surface-hover)] ${
                      isCurrent
                        ? 'bg-[var(--color-surface)] border border-[var(--color-border-strong,#ccc)]'
                        : ''
                    } ${iter.isOverride && !isCurrent ? 'bg-[#f0fdf4]' : ''}`}
                  >
                    <span className="font-mono text-sm font-semibold min-w-16 text-[var(--color-ink)]">
                      Iter {iter.num}
                    </span>
                    <span className="font-mono text-xs text-[var(--color-ink-secondary)] min-w-[160px]">
                      {iter.start} ~ {iter.end}
                    </span>
                    <span className="font-mono text-xs hidden sm:inline text-[var(--color-ink-faint)] min-w-10">
                      {days} 天
                    </span>
                    {isCurrent && (
                      <span
                        className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-solid)] text-[var(--color-solid-text)]"
                      >
                        当前
                      </span>
                    )}
                    {iter.isOverride && (
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[#bbf7d0] text-[#166534]">
                        已调整
                      </span>
                    )}
                    <div className="flex gap-1 ml-auto">
                      <button
                        onClick={() => startEdit(iter)}
                        className="font-mono text-xs px-2.5 py-1 rounded-md transition-colors hover:bg-[var(--color-surface-hover)] border border-[var(--color-border)] text-[var(--color-ink-muted)]"
                      >
                        调整
                      </button>
                      {iter.isOverride && (
                        <button
                          onClick={() => removeOverride(iter.num)}
                          className="font-mono text-xs px-2.5 py-1 rounded-md transition-colors border border-[var(--color-danger-border,#fca5a5)] text-[var(--color-danger-text,#dc2626)]"
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
          <p className="text-sm mb-3 font-serif text-[var(--color-ink-muted)]">
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
                  <span className="min-w-14 font-semibold">Iter {n}</span>
                  <span className="text-[var(--color-ink-secondary)]">
                    {o.start} ~ {o.end}
                  </span>
                  <span className="text-[var(--color-ink-faint)]">{days}天</span>
                  {diff !== 0 && (
                    <span
                      className={`text-[11px] ${diff > 0 ? 'text-[#166534]' : 'text-[var(--color-danger-text,#dc2626)]'}`}
                    >
                      {diff > 0 ? '+' : ''}
                      {diff}天
                    </span>
                  )}
                  <button
                    onClick={() => setViewCenter(n)}
                    className="ml-auto font-mono text-xs px-2 py-0.5 rounded-md border border-[var(--color-border)] text-[var(--color-ink-muted)]"
                  >
                    查看
                  </button>
                  <button
                    onClick={() => removeOverride(n)}
                    className="font-mono text-xs px-2 py-0.5 rounded-md border border-[var(--color-danger-border,#fca5a5)] text-[var(--color-danger-text,#dc2626)]"
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
