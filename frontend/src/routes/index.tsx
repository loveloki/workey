import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useAuth } from '../lib/auth-context'
import { useState, useEffect, useCallback } from 'react'
import { attendance, workLogs } from '../lib/api'
import { formatTime, getToday } from '../lib/date-utils'
import { MarkdownEditor } from '../lib/markdown-editor'

export const Route = createFileRoute('/')({ component: Dashboard })

function Dashboard() {
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
        <p className="mb-1 font-mono text-sm uppercase tracking-[0.3em] text-[#333]">今日工作</p>
        <h1 className="text-3xl font-normal tracking-tight text-black sm:text-4xl" style={{ fontFamily: 'Georgia, serif' }}>
          {new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}
        </h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <ClockCard />
        <WorkLogCard />
      </div>
    </main>
  )
}

function ClockCard() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)

  const load = useCallback(() => {
    attendance.today().then(d => setData(d.attendance)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const clockIn = async () => {
    setActing(true)
    try {
      const res = await attendance.clockIn()
      setData(res)
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

  const clockedIn = !!data?.clock_in
  const clockedOut = !!data?.clock_out

  return (
    <div className="rounded-lg border border-[#e5e5e5] bg-white p-6">
      <p className="mb-4 font-mono text-sm uppercase tracking-[0.3em] text-[#333]">§ 打卡签到 §</p>

      {loading ? (
        <p className="text-sm text-[#666]" style={{ fontFamily: 'Georgia, serif' }}>加载中...</p>
      ) : (
        <>
          <div className="mb-5 flex items-center gap-6">
            <div>
              <p className="font-mono text-xs uppercase tracking-wide text-[#666]">上班</p>
              <p className="font-mono text-2xl font-bold text-black">{formatTime(data?.clock_in)}</p>
            </div>
            <div className="h-8 w-px bg-[#e5e5e5]" />
            <div>
              <p className="font-mono text-xs uppercase tracking-wide text-[#666]">下班</p>
              <p className="font-mono text-2xl font-bold text-black">{formatTime(data?.clock_out)}</p>
            </div>
          </div>

          <div className="flex gap-2">
            {!clockedIn && (
              <button
                onClick={clockIn}
                disabled={acting}
                className="rounded-md bg-black px-5 py-2.5 font-mono text-sm text-white hover:bg-[#222] disabled:opacity-50"
              >
                上班打卡
              </button>
            )}
            {clockedIn && (
              <button
                onClick={clockOut}
                disabled={acting}
                className="rounded-md bg-black px-5 py-2.5 font-mono text-sm text-white hover:bg-[#222] disabled:opacity-50"
              >
                {clockedOut ? '更新下班时间' : '下班打卡'}
              </button>
            )}
          </div>

          {clockedIn && clockedOut && (
            <p className="mt-3 text-xs text-[#9ca3af]" style={{ fontFamily: 'Georgia, serif' }}>
              可多次点击更新下班时间
            </p>
          )}
        </>
      )}
    </div>
  )
}

function WorkLogCard() {
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    workLogs.today().then(d => {
      if (d.work_log) setContent(d.work_log.content)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      await workLogs.save(getToday(), content)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e: any) {
      alert(e.message)
    }
    setSaving(false)
  }

  return (
    <div className="rounded-lg border border-[#e5e5e5] bg-white p-6">
      <p className="mb-4 font-mono text-sm uppercase tracking-[0.3em] text-[#333]">§ 工作内容 §</p>

      {loading ? (
        <p className="text-sm text-[#666]" style={{ fontFamily: 'Georgia, serif' }}>加载中...</p>
      ) : (
        <>
          <div className="mb-4">
            <MarkdownEditor
              value={content}
              onChange={setContent}
              placeholder="记录今天的工作内容..."
              rows={6}
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={save}
              disabled={saving}
              className="rounded-md bg-black px-5 py-2.5 font-mono text-sm text-white hover:bg-[#222] disabled:opacity-50"
            >
              {saving ? '保存中...' : '保存'}
            </button>
            {saved && <span className="text-sm text-[#666]" style={{ fontFamily: 'Georgia, serif' }}>✓ 已保存</span>}
          </div>
        </>
      )}
    </div>
  )
}

function LoadingScreen() {
  return (
    <main className="flex min-h-[60vh] items-center justify-center px-4">
      <p className="font-mono text-sm text-[#666]">加载中...</p>
    </main>
  )
}
