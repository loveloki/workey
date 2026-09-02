import { useState, type FormEvent } from 'react'
import { settings } from '../../lib/api'
import { Card } from '../../components/Card'
import { InputField } from '../../components/InputField'
import { useI18n } from '../../lib/i18n'

export function PasswordSection() {
  const { t } = useI18n()
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
      setMsg(t('settings.password.tooShort'))
      setIsError(true)
      return
    }
    if (newPw !== confirmPw) {
      setMsg(t('settings.password.mismatch'))
      setIsError(true)
      return
    }

    setSaving(true)
    try {
      await settings.changePassword(oldPw, newPw)
      setMsg(t('settings.password.changed'))
      setIsError(false)
      setOldPw('')
      setNewPw('')
      setConfirmPw('')
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : t('settings.password.changeFailed'))
      setIsError(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card title={t('settings.password.title')}>
      <form onSubmit={submit} className="space-y-3 max-w-sm">
        <InputField label={t('settings.password.current')} type="password" value={oldPw} onChange={setOldPw} placeholder={t('settings.password.currentPlaceholder')} />
        <InputField label={t('settings.password.new')} type="password" value={newPw} onChange={setNewPw} placeholder={t('settings.password.newPlaceholder')} />
        <InputField label={t('settings.password.confirm')} type="password" value={confirmPw} onChange={setConfirmPw} placeholder={t('settings.password.confirmPlaceholder')} />
        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={saving}
            className="font-mono text-sm px-5 py-2 rounded-md text-[var(--color-solid-text)] transition-colors disabled:opacity-50 bg-[var(--color-solid)]"
          >
            {saving ? t('settings.password.changing') : t('settings.password.title')}
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
