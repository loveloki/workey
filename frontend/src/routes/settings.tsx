import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useAuth } from '../lib/auth-context'
import { useState, useEffect, useRef } from 'react'
import { settings } from '../lib/api'

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
        <p className="mb-1 font-mono text-sm uppercase tracking-[0.3em] text-[#333]">§ 设置</p>
        <h1
          className="text-3xl font-normal tracking-tight text-black sm:text-4xl"
          style={{ fontFamily: 'Georgia, serif' }}
        >
          偏好设置
        </h1>
      </div>

      <div className="grid gap-6">
        <TimezoneSection />
        <PasswordSection />
        <DataSection />
      </div>
    </main>
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
      await settings.save(timezone)
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
      <p className="text-sm mb-4" style={{ fontFamily: 'Georgia, serif', color: '#666' }}>
        设置你的工作时区，影响打卡时间的显示。
      </p>
      {loaded && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <select
            value={timezone}
            onChange={e => setTimezone(e.target.value)}
            className="font-mono text-sm px-3 py-2 rounded-md bg-white w-full sm:w-auto"
            style={{ border: '1px solid #e5e5e5', borderRadius: '6px' }}
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
            className="font-mono text-sm px-5 py-2 rounded-md text-white transition-colors disabled:opacity-50"
            style={{ background: '#000', borderRadius: '6px' }}
          >
            {saving ? '保存中...' : '保存'}
          </button>
          {msg && (
            <span className="font-mono text-sm" style={{ color: msg === '已保存' ? '#555' : '#c00' }}>
              {msg}
            </span>
          )}
        </div>
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
            className="font-mono text-sm px-5 py-2 rounded-md text-white transition-colors disabled:opacity-50"
            style={{ background: '#000', borderRadius: '6px' }}
          >
            {saving ? '修改中...' : '修改密码'}
          </button>
          {msg && (
            <span className="font-mono text-sm" style={{ color: isError ? '#c00' : '#555' }}>
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
      const data = await settings.exportData()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `workey-export-${new Date().toISOString().split('T')[0]}.json`
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
      const text = await file.text()
      const data = JSON.parse(text)
      if (!data.attendance && !data.work_logs) {
        throw new Error('无效的数据格式')
      }
      const result = await settings.importData(data)
      setMsg(`导入成功：${result.attendance_count} 条考勤，${result.work_log_count} 条工作日志`)
      setIsError(false)
    } catch (e: any) {
      setMsg(e.message || '导入失败')
      setIsError(true)
    } finally {
      setImporting(false)
      // Reset the file input
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <Card title="数据管理">
      <p className="text-sm mb-4" style={{ fontFamily: 'Georgia, serif', color: '#666' }}>
        导出所有考勤和工作日志数据为 JSON 文件，或从 JSON 文件导入数据。
      </p>
      <div className="flex flex-col sm:flex-row items-start gap-3">
        <button
          onClick={handleExport}
          disabled={exporting}
          className="font-mono text-sm px-5 py-2 rounded-md text-white transition-colors disabled:opacity-50"
          style={{ background: '#000', borderRadius: '6px' }}
        >
          {exporting ? '导出中...' : '↓ 导出数据'}
        </button>
        <button
          onClick={handleImport}
          disabled={importing}
          className="font-mono text-sm px-5 py-2 rounded-md bg-white transition-colors hover:bg-neutral-50 disabled:opacity-50"
          style={{ border: '1px solid #e5e5e5', borderRadius: '6px' }}
        >
          {importing ? '导入中...' : '↑ 导入数据'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json"
          onChange={onFileChange}
          className="hidden"
        />
      </div>
      {msg && (
        <p className="font-mono text-sm mt-3" style={{ color: isError ? '#c00' : '#555' }}>
          {msg}
        </p>
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
        background: 'var(--surface-strong)',
        border: '1px solid var(--line)',
        borderRadius: '8px',
      }}
    >
      <h2 className="font-mono text-xs uppercase tracking-[0.2em] mb-4" style={{ color: '#333' }}>
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
      <label className="block font-mono text-xs mb-1" style={{ color: '#666' }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="font-mono text-sm w-full px-3 py-2 bg-white"
        style={{ border: '1px solid #e5e5e5', borderRadius: '6px', outline: 'none' }}
      />
    </div>
  )
}

function LoadingScreen() {
  return (
    <main className="max-w-5xl mx-auto px-4 py-16 text-center">
      <p className="font-mono text-sm" style={{ color: '#666' }}>
        加载中...
      </p>
    </main>
  )
}
