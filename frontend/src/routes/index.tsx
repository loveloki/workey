import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useAuth } from '../lib/auth-context'
import { useState, useEffect } from 'react'
import { attendance, workLogs, lessons as lessonsApi } from '../lib/api'
import { formatTime, getToday } from '../lib/date-utils'
import { MarkdownEditor } from '../lib/markdown-editor'

export const Route = createFileRoute('/')({ component: Dashboard })

function Dashboard() {
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [todayData, setTodayData] = useState<any>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: '/login' })
  }, [authLoading, user, navigate])

  // Check if clocked in today
  useEffect(() => {
    if (!user) return
    attendance.today()
      .then(d => {
        if (!d.attendance?.clock_in) {
          // Not clocked in — go to clock page
          navigate({ to: '/clock' })
        } else {
          setTodayData(d.attendance)
          setChecking(false)
        }
      })
      .catch(() => setChecking(false))
  }, [user, navigate])

  if (authLoading || checking) return <LoadingScreen />
  if (!user) return null

  return (
    <main className="max-w-5xl mx-auto px-4 pb-8 pt-8">
      <div className="mb-6">
        <p className="mb-1 font-mono text-sm uppercase tracking-[0.3em] text-[#333]">今日工作</p>
        <h1
          className="text-3xl font-normal tracking-tight text-black sm:text-4xl"
          style={{ fontFamily: 'Georgia, serif' }}
        >
          {new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}
        </h1>
      </div>

      {/* Attendance summary bar */}
      {todayData && (
        <div
          className="mb-6 flex items-center gap-6 rounded-lg px-5 py-3"
          style={{ background: 'var(--surface-strong)', border: '1px solid var(--line)' }}
        >
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs uppercase tracking-wide text-[#666]">上班</span>
            <span className="font-mono text-sm font-bold text-black">{formatTime(todayData.clock_in)}</span>
          </div>
          <div className="h-4 w-px bg-[#e5e5e5]" />
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs uppercase tracking-wide text-[#666]">下班</span>
            <span className="font-mono text-sm font-bold text-black">{formatTime(todayData.clock_out)}</span>
          </div>
          <div className="flex-1" />
          <button
            onClick={() => navigate({ to: '/clock' })}
            className="font-mono text-xs px-3 py-1.5 rounded-md transition-colors hover:bg-[#f0f0f0]"
            style={{ border: '1px solid #e5e5e5', borderRadius: '6px', color: '#666' }}
          >
            打卡 →
          </button>
        </div>
      )}

      {/* Work log */}
      <WorkLogCard />

      {/* Lesson */}
      <div className="mt-6">
        <LessonCard />
      </div>
    </main>
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
              rows={10}
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

function LessonCard() {
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    lessonsApi.today().then(d => {
      if (d.lesson) setContent(d.lesson.content)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      await lessonsApi.save(getToday(), content)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e: any) {
      alert(e.message)
    }
    setSaving(false)
  }

  return (
    <div className="rounded-lg border border-[#e5e5e5] bg-white p-6">
      <p className="mb-4 font-mono text-sm uppercase tracking-[0.3em] text-[#333]">§ 经验教训 §</p>

      {loading ? (
        <p className="text-sm text-[#666]" style={{ fontFamily: 'Georgia, serif' }}>加载中...</p>
      ) : (
        <>
          <div className="mb-4">
            <MarkdownEditor
              value={content}
              onChange={setContent}
              placeholder="记录今天的经验教训、反思与收获..."
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
