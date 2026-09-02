import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '../components/PageHeader'
import { useAuthGuard } from '../lib/useAuthGuard'
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { type Attendance } from '../lib/api'
import { getDateRange, type RangePreset } from '../lib/date-utils'
import { useAttendanceRange, useAttendanceStats } from '../lib/queries'
import { useI18n } from '../lib/i18n'

export const Route = createFileRoute('/trends')({
  component: TrendsPage,
})

function timeToMinutes(datetime: string | undefined): number | null {
  if (!datetime) return null
  const d = new Date(datetime)
  if (isNaN(d.getTime())) return null
  return d.getHours() * 60 + d.getMinutes()
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

function TrendsPage() {
  const { t } = useI18n()
  const { user, loading } = useAuthGuard()
  const [preset, setPreset] = useState<RangePreset | 'custom'>('month')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  // 自定义搜索时，确认后才更新 activeCustom 触发查询
  const [activeCustom, setActiveCustom] = useState<{ start: string; end: string } | null>(null)

  // 计算当前查询的日期范围
  const { start, end } = useMemo(() => {
    if (preset === 'custom' && activeCustom) return activeCustom
    if (preset !== 'custom') return getDateRange(preset as RangePreset)
    return { start: '', end: '' }
  }, [preset, activeCustom])

  const { data: statsData } = useAttendanceStats(!!user)
  const { data: rangeData, isFetching: fetching } = useAttendanceRange(start, end, !!user)

  const globalStats = statsData ?? null
  const data: Attendance[] = rangeData?.attendances ?? []
  const hasLoaded = !!rangeData

  const handleCustomSearch = () => {
    if (customStart && customEnd) setActiveCustom({ start: customStart, end: customEnd })
  }

  const presets: { key: RangePreset | 'custom'; label: string }[] = [
    { key: 'week', label: t('trends.range.week') },
    { key: 'month', label: t('trends.range.month') },
    { key: 'quarter', label: t('trends.range.quarter') },
    { key: 'half-year', label: t('trends.range.halfYear') },
    { key: 'year', label: t('trends.range.year') },
    { key: 'custom', label: t('trends.range.custom') },
  ]

  if (loading) return null

  return (
    <main className="max-w-5xl mx-auto px-4 pb-8 pt-8">
      <PageHeader eyebrow={t('trends.eyebrow')} title={t('trends.title')} />

      <div className="mb-4 flex flex-wrap gap-2">
        {presets.map(p => (
          <button
            key={p.key}
            onClick={() => setPreset(p.key)}
            className={`rounded-md border px-4 py-2 font-mono text-sm ${
              preset === p.key
                ? 'font-medium border-[var(--color-border-strong)] bg-[var(--color-surface-hover)] text-[var(--color-ink)]'
                : 'border-[var(--color-border)] bg-[var(--color-surface-strong)] text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)]'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {preset === 'custom' && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={customStart}
            onChange={e => setCustomStart(e.target.value)}
            className="rounded-lg border px-4 py-3.5 font-mono text-sm focus:outline-none border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink)] focus:border-[var(--color-border-focus)]"
          />
          <span className="text-sm font-serif text-[var(--color-ink-muted)]">{t('trends.to')}</span>
          <input
            type="date"
            value={customEnd}
            onChange={e => setCustomEnd(e.target.value)}
            className="rounded-lg border px-4 py-3.5 font-mono text-sm focus:outline-none border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink)] focus:border-[var(--color-border-focus)]"
          />
          <button
            onClick={handleCustomSearch}
            className="rounded-md px-5 py-2.5 font-mono text-sm bg-[var(--color-solid)] text-[var(--color-solid-text)] hover:bg-[var(--color-solid-hover)]"
          >
            {t('trends.search')}
          </button>
        </div>
      )}

      {/* Chart area: always mounted after first load so it transitions smoothly */}
      {hasLoaded ? (
        <div className="rounded-lg border p-6 border-[var(--color-border)] bg-[var(--color-surface-strong)]">
          <TrendChart data={data} loading={fetching} />
        </div>
      ) : fetching ? (
        <p className="font-mono text-sm text-[var(--color-ink-muted)]">{t('common.loading')}</p>
      ) : (
        <div className="rounded-lg border p-8 text-center border-[var(--color-border)] bg-[var(--color-surface-strong)]">
          <p className="text-sm font-serif text-[var(--color-ink-muted)]">{t('trends.noData')}</p>
        </div>
      )}

      {/* Stats summary */}
      <div className="mt-4 grid gap-4 sm:grid-cols-4">
        <StatCard
          label={t('trends.avgClockIn')}
          value={data.length > 0 ? avgTime(data.filter(d => d.status !== 'leave').map(d => timeToMinutes(d.clock_in)).filter((v): v is number => v !== null)) : '--:--'}
        />
        <StatCard
          label={t('trends.avgClockOut')}
          value={data.length > 0 ? avgTime(data.filter(d => d.status !== 'leave').map(d => timeToMinutes(d.clock_out)).filter((v): v is number => v !== null)) : '--:--'}
        />
        <StatCard
          label={t('trends.punchDays')}
          value={data.length > 0 ? t('trends.days', { count: data.filter(d => d.status !== 'leave').length }) : t('trends.days', { count: 0 })}
        />
        <StatCard
          label={t('trends.leaveDays')}
          value={data.length > 0 ? t('trends.days', { count: data.filter(d => d.status === 'leave').length }) : t('trends.days', { count: 0 })}
        />
      </div>

      {/* Global balance */}
      {globalStats && (
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <StatCard
            label={t('trends.overtimeDaysTotal')}
            value={t('trends.days', { count: globalStats.global_overtime_days })}
            valueColor="var(--color-danger-text)"
          />
          <StatCard
            label={t('trends.leaveDaysTotal')}
            value={t('trends.days', { count: globalStats.global_leave_days })}
            valueColor="var(--color-ink-muted)"
          />
          <StatCard
            label={t('trends.remainingDays')}
            value={t('trends.days', { count: globalStats.global_remaining })}
            valueColor={globalStats.global_remaining > 0 ? '#16a34a' : 'var(--color-ink)'}
          />
        </div>
      )}
    </main>
  )
}

function avgTime(minutes: number[]): string {
  if (minutes.length === 0) return '--:--'
  const avg = Math.round(minutes.reduce((a, b) => a + b, 0) / minutes.length)
  return minutesToTime(avg)
}

function StatCard({ label, value, valueColor = 'var(--color-ink)' }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="rounded-lg border p-5 text-center border-[var(--color-border)] bg-[var(--color-surface-strong)]">
      <p className="mb-1 font-mono text-xs uppercase tracking-[0.3em] text-[var(--color-ink-muted)]">{label}</p>
      <p className="font-mono text-2xl font-bold" style={{ color: valueColor }}>{value}</p>
    </div>
  )
}

function TrendChart({ data, loading }: { data: Attendance[]; loading: boolean }) {
  const { t } = useI18n()
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  // Compute chart data from props
  const chartData = useMemo(() => {
    const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date))
    const clockIns = sorted.map(d => ({ date: d.date, minutes: timeToMinutes(d.clock_in) }))
    const clockOuts = sorted.map(d => ({ date: d.date, minutes: timeToMinutes(d.clock_out) }))

    const allMinutes = [...clockIns, ...clockOuts]
      .map(d => d.minutes)
      .filter((v): v is number => v !== null)

    return { sorted, clockIns, clockOuts, allMinutes }
  }, [data])

  const { sorted, clockIns, clockOuts, allMinutes } = chartData

  // Clear selection when data changes and selected date is no longer in range
  useEffect(() => {
    if (selectedDate && !sorted.find(d => d.date === selectedDate)) {
      setSelectedDate(null)
    }
  }, [sorted, selectedDate])

  // Find the selected index
  const selectedIdx = selectedDate !== null ? sorted.findIndex(d => d.date === selectedDate) : -1

  if (loading && data.length === 0) {
    return <p className="font-mono text-sm text-[var(--color-ink-muted)]">{t('common.loading')}</p>
  }

  if (allMinutes.length === 0) {
    return <p className="text-sm font-serif text-[var(--color-ink-muted)]">{t('trends.noData')}</p>
  }

  const minY = Math.floor(Math.min(...allMinutes) / 60) * 60 - 30
  const maxY = Math.ceil(Math.max(...allMinutes) / 60) * 60 + 30

  const W = 800
  const H = 300
  const PAD = { top: 20, right: 20, bottom: 50, left: 55 }
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom

  const xScale = (i: number) => PAD.left + (sorted.length === 1 ? plotW / 2 : (i / (sorted.length - 1)) * plotW)
  // Y axis: INVERTED — earlier times (smaller minutes) at top, later times at bottom
  const yScale = (m: number) => PAD.top + ((m - minY) / (maxY - minY)) * plotH

  const makePath = (points: { minutes: number | null }[]) => {
    const validPoints = points
      .map((p, i) => p.minutes !== null ? `${xScale(i)},${yScale(p.minutes)}` : null)
      .filter(Boolean)
    if (validPoints.length === 0) return ''
    return `M${validPoints.join('L')}`
  }

  // Y axis labels
  const yTicks: number[] = []
  for (let m = Math.ceil(minY / 60) * 60; m <= maxY; m += 60) {
    yTicks.push(m)
  }

  // X axis labels (show subset if too many)
  const maxXLabels = 15
  const step = Math.max(1, Math.ceil(sorted.length / maxXLabels))

  // Compute date range for the date picker
  const dateMin = sorted.length > 0 ? sorted[0].date : ''
  const dateMax = sorted.length > 0 ? sorted[sorted.length - 1].date : ''

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4 font-mono text-xs">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-4 rounded-sm bg-[var(--color-ink)]" />
            {t('trends.chart.clockInLegend')}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-4 rounded-sm bg-[var(--color-ink-muted)]" />
            {t('trends.chart.clockOutLegend')}
          </span>
        </div>
        <div className="flex items-center gap-2 font-mono text-xs">
          <label className="text-[var(--color-ink-secondary)]">{t('trends.chart.markDate')}</label>
          <input
            type="date"
            value={selectedDate || ''}
            min={dateMin}
            max={dateMax}
            onChange={e => setSelectedDate(e.target.value || null)}
            className="rounded border px-2 py-1 font-mono text-xs focus:outline-none border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink)] focus:border-[var(--color-border-focus)]"
          />
          {selectedDate && (
            <button
              onClick={() => setSelectedDate(null)}
              className="rounded px-1.5 py-0.5 text-xs text-[var(--color-ink-muted)]"
              title={t('trends.chart.clearSelection')}
            >
              ✕
            </button>
          )}
        </div>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className={`w-full max-h-[350px] transition-opacity duration-200 ${loading ? 'opacity-50' : 'opacity-100'}`}
      >
        {/* Grid lines */}
        {yTicks.map(m => (
          <g key={m}>
            <line x1={PAD.left} y1={yScale(m)} x2={W - PAD.right} y2={yScale(m)}
              stroke="var(--color-border)" strokeDasharray="4" />
            <text x={PAD.left - 8} y={yScale(m) + 4} textAnchor="end"
              fill="var(--color-ink-muted)" fontSize="11" fontFamily="ui-monospace, SFMono-Regular, monospace">
              {minutesToTime(m)}
            </text>
          </g>
        ))}

        {/* X axis labels */}
        {sorted.map((d, i) => {
          if (i % step !== 0 && i !== sorted.length - 1) return null
          const label = d.date.substring(5) // MM-DD
          return (
            <text key={d.date} x={xScale(i)} y={H - PAD.bottom + 20} textAnchor="middle"
              fill="var(--color-ink-muted)" fontSize="10" fontFamily="ui-monospace, SFMono-Regular, monospace"
              transform={`rotate(-35, ${xScale(i)}, ${H - PAD.bottom + 20})`}>
              {label}
            </text>
          )
        })}

        {/* Selected date vertical line */}
        {selectedIdx >= 0 && (
          <line
            x1={xScale(selectedIdx)} y1={PAD.top}
            x2={xScale(selectedIdx)} y2={PAD.top + plotH}
            stroke="var(--color-accent, #e67e22)" strokeWidth="1.5" strokeDasharray="6 3" opacity={0.7}
          />
        )}

        {/* Clock-in line */}
        <path d={makePath(clockIns)} fill="none" stroke="var(--color-ink)" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round" />

        {/* Clock-out line */}
        <path d={makePath(clockOuts)} fill="none" stroke="var(--color-ink-muted)" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round" />

        {/* Leave dots */}
        {sorted.map((d, i) => d.status === 'leave' ? (
          <circle key={`leave-${i}`} cx={xScale(i)} cy={H - PAD.bottom + 5} r="4"
            fill="var(--color-danger-text, #dc2626)" />
        ) : null)}

        {/* Dots */}
        {clockIns.map((p, i) => p.minutes !== null ? (
          <circle key={`in-${i}`} cx={xScale(i)} cy={yScale(p.minutes)} r="3.5"
            fill="var(--color-ink)" stroke="var(--color-surface-strong)" strokeWidth="1.5" />
        ) : null)}
        {clockOuts.map((p, i) => p.minutes !== null ? (
          <circle key={`out-${i}`} cx={xScale(i)} cy={yScale(p.minutes)} r="3.5"
            fill="var(--color-ink-muted)" stroke="var(--color-surface-strong)" strokeWidth="1.5" />
        ) : null)}

        {/* Selected date annotations */}
        {selectedIdx >= 0 && (() => {
          const isLeave = sorted[selectedIdx].status === 'leave'
          const inMin = clockIns[selectedIdx]?.minutes
          const outMin = clockOuts[selectedIdx]?.minutes
          const cx = xScale(selectedIdx)
          // Determine label side: if point is in right half, put labels on the left
          const isRightHalf = cx > PAD.left + plotW / 2
          const labelAnchor = isRightHalf ? 'end' as const : 'start' as const
          const labelDx = isRightHalf ? -12 : 12

          if (isLeave) {
            return (
              <g>
                <circle cx={cx} cy={H - PAD.bottom + 5} r="6"
                  fill="var(--color-danger-text, #dc2626)" stroke="var(--color-accent, #e67e22)" strokeWidth="2.5" />
                <rect
                  x={isRightHalf ? cx + labelDx - 48 : cx + labelDx - 4}
                  y={H - PAD.bottom + 5 - 11}
                  width={52} height={20} rx={4}
                  fill="var(--color-danger-text, #dc2626)" opacity={0.9}
                />
                <text
                  x={isRightHalf ? cx + labelDx - 22 : cx + labelDx + 22}
                  y={H - PAD.bottom + 5 + 3}
                  textAnchor="middle"
                  fill="#fff" fontSize="11" fontWeight="600"
                >
                  {t('trends.chart.leave')}
                </text>
              </g>
            )
          }

          return (
            <g>
              {/* Highlighted dots — larger, with accent ring */}
              {inMin !== null && (
                <>
                  <circle cx={cx} cy={yScale(inMin)} r="6"
                    fill="var(--color-ink)" stroke="var(--color-accent, #e67e22)" strokeWidth="2.5" />
                  {/* Label: clock-in time */}
                  <rect
                    x={isRightHalf ? cx + labelDx - 72 : cx + labelDx - 4}
                    y={yScale(inMin) - 11}
                    width={76} height={20} rx={4}
                    fill="var(--color-ink)" opacity={0.9}
                  />
                  <text
                    x={isRightHalf ? cx + labelDx - 36 : cx + labelDx + 34}
                    y={yScale(inMin) + 3}
                    textAnchor="middle"
                    fill="var(--color-solid-text, #fff)" fontSize="11" fontWeight="600"
                    fontFamily="ui-monospace, SFMono-Regular, monospace"
                  >
                    {t('trends.chart.clockInAt', { time: minutesToTime(inMin) })}
                  </text>
                </>
              )}
              {outMin !== null && (
                <>
                  <circle cx={cx} cy={yScale(outMin)} r="6"
                    fill="var(--color-ink-muted)" stroke="var(--color-accent, #e67e22)" strokeWidth="2.5" />
                  {/* Label: clock-out time */}
                  <rect
                    x={isRightHalf ? cx + labelDx - 72 : cx + labelDx - 4}
                    y={yScale(outMin) - 11}
                    width={76} height={20} rx={4}
                    fill="var(--color-ink-muted)" opacity={0.9}
                  />
                  <text
                    x={isRightHalf ? cx + labelDx - 36 : cx + labelDx + 34}
                    y={yScale(outMin) + 3}
                    textAnchor="middle"
                    fill="var(--color-solid-text, #fff)" fontSize="11" fontWeight="600"
                    fontFamily="ui-monospace, SFMono-Regular, monospace"
                  >
                    {t('trends.chart.clockOutAt', { time: minutesToTime(outMin) })}
                  </text>
                </>
              )}
            </g>
          )
        })()}

        {/* Hover targets — also allow click to select */}
        {sorted.map((d, i) => {
          const inMin = timeToMinutes(d.clock_in)
          const outMin = timeToMinutes(d.clock_out)
          const tooltip = t('trends.chart.tooltip', {
            date: d.date,
            in: inMin !== null ? minutesToTime(inMin) : '--:--',
            out: outMin !== null ? minutesToTime(outMin) : '--:--',
          })
          return (
            <rect key={`hover-${i}`} x={xScale(i) - 15} y={PAD.top} width={30} height={plotH}
              fill="transparent" className="cursor-pointer"
              onClick={() => setSelectedDate(prev => prev === d.date ? null : d.date)}>
              <title>{tooltip}</title>
            </rect>
          )
        })}
      </svg>
    </div>
  )
}
