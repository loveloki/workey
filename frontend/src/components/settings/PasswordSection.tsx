import { useState, type FormEvent } from 'react'
import { settings } from '../../lib/api'
import { Card } from '../../components/Card'
import { InputField } from '../../components/InputField'

export function PasswordSection() {
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [isError, setIsError] = useState(false)

  const submit = async (e: FormEvent) => {
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
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : '修改失败')
      setIsError(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card title="修改密码">
      <form onSubmit={submit} className="space-y-3 max-w-sm">
        <InputField label="当前密码" type="password" value={oldPw} onChange={setOldPw} placeholder="输入当前密码" />
        <InputField label="新密码" type="password" value={newPw} onChange={setNewPw} placeholder="至少 6 个字符" />
        <InputField label="确认新密码" type="password" value={confirmPw} onChange={setConfirmPw} placeholder="再次输入新密码" />
        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={saving}
            className="font-mono text-sm px-5 py-2 rounded-md text-[var(--color-solid-text)] transition-colors disabled:opacity-50 bg-[var(--color-solid)]"
          >
            {saving ? '修改中...' : '修改密码'}
          </button>
          {msg && (
            <span
              className={`font-mono text-sm ${isError ? 'text-[var(--color-danger-text)]' : 'text-[var(--color-ink-muted)]'}`}
            >
              {msg}
            </span>
          )}
        </div>
      </form>
    </Card>
  )
}
