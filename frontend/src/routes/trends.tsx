import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useAuth } from '../lib/auth-context'
import { useState, useEffect } from 'react'
import { attendance as attendanceApi } from '../lib/api'
import { getDateRange, type RangePreset } from '../lib/date-utils'

export const Route = createFileRoute('/trends')({
  component: TrendsPage,
})

interface AttendanceRecord {
  date: string
  clock_in: string | null
  clock_out: string | null
}

function timeToMinutes(datetime: string | null): number | null {
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
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const [preset, setPreset] = useState<RangePreset | 'custom'>('month')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [data, setData] = useState<AttendanceRecord[]>([])
  const [fetching, setFetching] = useState(false)

  useEffect(() => {
    if (!loading && !user) navigate({ to: '/login' })
  }, [loading, user, navigate])

  useEffect(() => {
    if (!user || preset === 'custom') return
    const range = getDateRange(preset as RangePreset)
    fetchData(range.start, range.end)
  }, [preset, user])

  const fetchData = async (start: string, end: string) => {
    setFetching(true)
    try {
      const res = await attendanceApi.range(start, end)
      setData(res.attendances)
    } catch (e) {
      console.error(e)
    }
    setFetching(false)
  }

  const handleCustomSearch = () => {
    if (customStart && customEnd) fetchData(customStart, customEnd)
  }

  const presets: { key: RangePreset | 'custom'; label: string }[] = [
    { key: 'week', label: '本周' },
    { key: 'month', label: '本月' },
    { key: 'quarter', label: '本季度' },
    { key: 'half-year', label: '半年' },
    { key: 'year', label: '全年' },
    { key: 'custom', label: '自定义' },
  ]

  if (loading) return null

  return (
    <main className="page-wrap px-4 pb-8 pt-8">
      <div className="rise-in mb-6">
        <p className="island-kicker mb-1">数据趋势</p>
        <h1 className="display-title text-3xl font-bold tracking-tight text-[var(--sea-ink)]">
          上下班时间
        </h1>
      </div>

      <div className="rise-in mb-4 flex flex-wrap gap-2" style={{ animationDelay: '80ms' }}>
        {presets.map(p => (
          <button
            key={p.key}
            onClick={() => setPreset(p.key)}
            className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition hover:-translate-y-0.5 ${
              preset === p.key
                ? 'border-[rgba(50,143,151,0.3)] bg-[rgba(79,184,178,0.14)] text-[var(--lagoon-deep)]'
                : 'border-[var(--line)] bg-[var(--surface)] text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {preset === 'custom' && (
        <div className="rise-in mb-4 flex flex-wrap items-center gap-2">
          <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
            className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--sea-ink)] focus:border-[var(--lagoon)] focus:outline-none" />
          <span className="text-sm text-[var(--sea-ink-soft)]">至</span>
          <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
            className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--sea-ink)] focus:border-[var(--lagoon)] focus:outline-none" />
          <button onClick={handleCustomSearch}
            className="rounded-full border border-[rgba(50,143,151,0.3)] bg-[rgba(79,184,178,0.14)] px-4 py-2 text-xs font-semibold text-[var(--lagoon-deep)] transition hover:-translate-y-0.5 hover:bg-[rgba(79,184,178,0.24)]">
            查询
          </button>
        </div>
      )}

      {fetching ? (
        <p className="text-sm text-[var(--sea-ink-soft)]">加载中...</p>
      ) : data.length === 0 ? (
        <div className="island-shell rise-in rounded-2xl p-8 text-center">
          <p className="text-sm text-[var(--sea-ink-soft)]">暂无打卡数据</p>
        </div>
      ) : (
        <div className="island-shell rise-in rounded-2xl p-6" style={{ animationDelay: '120ms' }}>
          <TrendChart data={data} />
        </div>
      )}

      {/* Stats summary */}
      {data.length > 0 && (
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <StatCard
            label="平均上班时间"
            value={avgTime(data.map(d => timeToMinutes(d.clock_in)).filter((v): v is number => v !== null))}
            delay={200}
          />
          <StatCard
            label="平均下班时间"
            value={avgTime(data.map(d => timeToMinutes(d.clock_out)).filter((v): v is number => v !== null))}
            delay={280}
          />
          <StatCard
            label="打卡天数"
            value={`${data.length} 天`}
            delay={360}
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

function StatCard({ label, value, delay }: { label: string; value: string; delay: number }) {
  return (
    <div className="island-shell rise-in rounded-2xl p-5 text-center" style={{ animationDelay: `${delay}ms` }}>
      <p className="text-xs text-[var(--sea-ink-soft)]">{label}</p>
      <p className="text-2xl font-bold text-[var(--sea-ink)]">{value}</p>
    </div>
  )
}

function TrendChart({ data }: { data: AttendanceRecord[] }) {
  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date))

  const clockIns = sorted.map(d => ({ date: d.date, minutes: timeToMinutes(d.clock_in) }))
  const clockOuts = sorted.map(d => ({ date: d.date, minutes: timeToMinutes(d.clock_out) }))

  // Find min/max for Y axis
  const allMinutes = [...clockIns, ...clockOuts]
    .map(d => d.minutes)
    .filter((v): v is number => v !== null)

  if (allMinutes.length === 0) {
    return <p className="text-sm text-[var(--sea-ink-soft)]">无有效数据</p>
  }

  const minY = Math.floor(Math.min(...allMinutes) / 60) * 60 - 30
  const maxY = Math.ceil(Math.max(...allMinutes) / 60) * 60 + 30

  const W = 800
  const H = 300
  const PAD = { top: 20, right: 20, bottom: 50, left: 55 }
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom

  const xScale = (i: number) => PAD.left + (sorted.length === 1 ? plotW / 2 : (i / (sorted.length - 1)) * plotW)
  const yScale = (m: number) => PAD.top + plotH - ((m - minY) / (maxY - minY)) * plotH

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

  return (
    <div>
      <div className="mb-3 flex items-center gap-4 text-xs">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-4 rounded bg-[var(--lagoon)]" />
          上班时间
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-4 rounded bg-[var(--palm)]" />
          下班时间
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: '350px' }}>
        {/* Grid lines */}
        {yTicks.map(m => (
          <g key={m}>
            <line x1={PAD.left} y1={yScale(m)} x2={W - PAD.right} y2={yScale(m)}
              stroke="var(--line)" strokeDasharray="4" />
            <text x={PAD.left - 8} y={yScale(m) + 4} textAnchor="end"
              fill="var(--sea-ink-soft)" fontSize="11" fontFamily="var(--font-sans)">
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
              fill="var(--sea-ink-soft)" fontSize="10" fontFamily="var(--font-sans)"
              transform={`rotate(-35, ${xScale(i)}, ${H - PAD.bottom + 20})`}>
              {label}
            </text>
          )
        })}

        {/* Clock-in line */}
        <path d={makePath(clockIns)} fill="none" stroke="var(--lagoon)" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round" />

        {/* Clock-out line */}
        <path d={makePath(clockOuts)} fill="none" stroke="var(--palm)" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round" />

        {/* Dots */}
        {clockIns.map((p, i) => p.minutes !== null ? (
          <circle key={`in-${i}`} cx={xScale(i)} cy={yScale(p.minutes)} r="3.5"
            fill="var(--lagoon)" stroke="white" strokeWidth="1.5" />
        ) : null)}
        {clockOuts.map((p, i) => p.minutes !== null ? (
          <circle key={`out-${i}`} cx={xScale(i)} cy={yScale(p.minutes)} r="3.5"
            fill="var(--palm)" stroke="white" strokeWidth="1.5" />
        ) : null)}

        {/* Hover targets with tooltips */}
        {sorted.map((d, i) => {
          const inMin = timeToMinutes(d.clock_in)
          const outMin = timeToMinutes(d.clock_out)
          const tooltip = `${d.date}\n上班: ${inMin !== null ? minutesToTime(inMin) : '--:--'}\n下班: ${outMin !== null ? minutesToTime(outMin) : '--:--'}`
          return (
            <rect key={`hover-${i}`} x={xScale(i) - 15} y={PAD.top} width={30} height={plotH}
              fill="transparent" className="cursor-pointer">
              <title>{tooltip}</title>
            </rect>
          )
        })}
      </svg>
    </div>
  )
}
