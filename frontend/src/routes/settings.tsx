import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useAuth } from '../lib/auth-context'
import { useState, useEffect, useRef } from 'react'
import { settings, passkeys as passkeysApi, base64urlToBuffer, type Passkey } from '../lib/api'
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
        <KanbanUrlSection />
        <PasskeySection />
        <PasswordSection />
        <DataSection />
        <DeleteDataSection />
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
      if (result.image_count) parts.push(`${result.image_count} 张图片`)
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
        导出所有考勤、工作日志和图片为 ZIP 压缩包，或从 ZIP 文件导入数据。
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
