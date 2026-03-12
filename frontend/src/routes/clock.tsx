import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useAuth } from '../lib/auth-context'
import { useState, useEffect, useCallback } from 'react'
import { attendance } from '../lib/api'
import { formatTime } from '../lib/date-utils'

export const Route = createFileRoute('/clock')({ component: ClockPage })

function ClockPage() {
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: '/login' })
  }, [authLoading, user, navigate])

  if (authLoading) return <Loading />
  if (!user) return null

  return (
    <main className="max-w-5xl mx-auto px-4 pb-8 pt-8">
      <div className="mb-8 text-center">
        <p className="mb-1 font-mono text-sm uppercase tracking-[0.3em] text-[#333]">打卡签到</p>
        <h1
          className="text-3xl font-normal tracking-tight text-black sm:text-4xl"
          style={{ fontFamily: 'Georgia, serif' }}
        >
          {new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}
        </h1>
      </div>
      <ClockWidget />
    </main>
  )
}

function ClockWidget() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)
  const [now, setNow] = useState(new Date())
  const navigate = useNavigate()

  useEffect(() => {
    attendance.today()
      .then(d => setData(d.attendance))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const clockedIn = !!data?.clock_in
  const clockedOut = !!data?.clock_out

  const clockIn = async () => {
    setActing(true)
    try {
      const res = await attendance.clockIn()
      setData(res)
      // After clocking in, go to today's work page
      setTimeout(() => navigate({ to: '/' }), 600)
    } catch (e: any) {
      alert(e.message)
    }
    setActing(false)
  }

  const clockOut = async () => {
    setActing(true)
    try {
      const res = await attendance.clockOut()
      setData(res)
    } catch (e: any) {
      alert(e.message)
    }
    setActing(false)
  }

  if (loading) return <Loading />

  const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })

  return (
    <div className="flex flex-col items-center">
      {/* Live time */}
      <p className="font-mono text-5xl sm:text-6xl font-bold text-black mb-8 tabular-nums tracking-wider">
        {timeStr}
      </p>

      {/* Big circular button */}
      {!clockedIn ? (
        <button
          onClick={clockIn}
          disabled={acting}
          className="group relative"
          style={{ outline: 'none' }}
        >
          <div
            className="w-44 h-44 sm:w-52 sm:h-52 rounded-full flex flex-col items-center justify-center transition-all duration-200 active:scale-95 disabled:opacity-50"
            style={{
              background: '#000',
              boxShadow: '0 4px 24px rgba(0,0,0,0.15), 0 0 0 6px rgba(0,0,0,0.04)',
            }}
          >
            <span className="font-mono text-2xl sm:text-3xl font-bold text-white">
              {acting ? '打卡中' : '上班'}
            </span>
            <span className="font-mono text-sm text-white/60 mt-1">
              点击打卡
            </span>
          </div>
        </button>
      ) : (
        <button
          onClick={clockOut}
          disabled={acting}
          className="group relative"
          style={{ outline: 'none' }}
        >
          <div
            className="w-44 h-44 sm:w-52 sm:h-52 rounded-full flex flex-col items-center justify-center transition-all duration-200 active:scale-95 disabled:opacity-50"
            style={{
              background: clockedOut ? '#333' : '#000',
              boxShadow: '0 4px 24px rgba(0,0,0,0.15), 0 0 0 6px rgba(0,0,0,0.04)',
            }}
          >
            <span className="font-mono text-2xl sm:text-3xl font-bold text-white">
              {acting ? '打卡中' : '下班'}
            </span>
            <span className="font-mono text-sm text-white/60 mt-1">
              {clockedOut ? '更新时间' : '点击打卡'}
            </span>
          </div>
        </button>
      )}

      {/* Status row */}
      <div
        className="mt-10 flex items-center gap-8 rounded-lg px-8 py-5"
        style={{ background: 'var(--surface-strong)', border: '1px solid var(--line)' }}
      >
        <div className="text-center">
          <p className="font-mono text-xs uppercase tracking-wide text-[#666] mb-1">上班</p>
          <p className="font-mono text-xl font-bold text-black">{formatTime(data?.clock_in)}</p>
        </div>
        <div className="h-10 w-px bg-[#e5e5e5]" />
        <div className="text-center">
          <p className="font-mono text-xs uppercase tracking-wide text-[#666] mb-1">下班</p>
          <p className="font-mono text-xl font-bold text-black">{formatTime(data?.clock_out)}</p>
        </div>
        {clockedIn && data?.clock_in && data?.clock_out && (
          <>
            <div className="h-10 w-px bg-[#e5e5e5]" />
            <div className="text-center">
              <p className="font-mono text-xs uppercase tracking-wide text-[#666] mb-1">时长</p>
              <p className="font-mono text-xl font-bold text-black">{calcDuration(data.clock_in, data.clock_out)}</p>
            </div>
          </>
        )}
      </div>

      {/* Hint */}
      {clockedIn && !clockedOut && (
        <p className="mt-4 text-sm text-[#9ca3af]" style={{ fontFamily: 'Georgia, serif' }}>
          已上班打卡，下班时请再次打卡
        </p>
      )}
      {clockedIn && clockedOut && (
        <p className="mt-4 text-sm text-[#9ca3af]" style={{ fontFamily: 'Georgia, serif' }}>
          可再次点击更新下班时间
        </p>
      )}
    </div>
  )
}

function calcDuration(clockIn: string, clockOut: string): string {
  const a = new Date(clockIn)
  const b = new Date(clockOut)
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return '--'
  const diffMin = Math.round((b.getTime() - a.getTime()) / 60000)
  const h = Math.floor(diffMin / 60)
  const m = diffMin % 60
  return `${h}h${m.toString().padStart(2, '0')}m`
}

function Loading() {
  return (
    <main className="flex min-h-[60vh] items-center justify-center px-4">
      <p className="font-mono text-sm text-[#666]">加载中...</p>
    </main>
  )
}
