import { useState } from 'react'
import { settings } from '../../lib/api'
import { Card } from '../../components/Card'
import { useQueryClient } from '@tanstack/react-query'
import { useI18n } from '../../lib/i18n'

export function DeleteDataSection() {
  const { t } = useI18n()
  const [step, setStep] = useState<'idle' | 'confirm' | 'password'>('idle')
  const [password, setPassword] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [msg, setMsg] = useState('')
  const [isError, setIsError] = useState(false)
  const qc = useQueryClient()

  const handleDelete = async () => {
    if (!password) {
      setMsg(t('settings.deleteData.enterPasswordRequired'))
      setIsError(true)
      return
    }
    setDeleting(true)
    setMsg('')
    try {
      const result = await settings.deleteData(password)
      const parts = []
      if (result.attendance_count)
        parts.push(t('settings.deleteData.countAttendance', { count: result.attendance_count }))
      if (result.work_log_count)
        parts.push(t('settings.deleteData.countWorkLog', { count: result.work_log_count }))
      if (result.todo_count)
        parts.push(t('settings.deleteData.countTodo', { count: result.todo_count }))
      if (result.ticket_issue_count)
        parts.push(t('settings.deleteData.countTicketIssue', { count: result.ticket_issue_count }))
      setMsg(
        t('settings.deleteData.deleted', {
          items:
            parts.join(t('settings.deleteData.listSeparator')) || t('settings.deleteData.noData'),
        })
      )
      setIsError(false)
      setStep('idle')
      setPassword('')
      // 删除数据后刷新所有缓存
      qc.invalidateQueries()
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : t('common.deleteFailed'))
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
    <Card title={t('settings.deleteData.title')}>
      <p className="text-sm mb-4 font-serif text-[var(--color-danger-text)]">
        {t('settings.deleteData.description')}
      </p>

      {step === 'idle' && (
        <button
          onClick={() => setStep('confirm')}
          className="font-mono text-sm px-5 py-2 rounded-md text-[var(--color-solid-text)] transition-colors bg-[var(--color-danger)]"
        >
          {t('settings.deleteData.deleteAll')}
        </button>
      )}

      {step === 'confirm' && (
        <div className="rounded-lg p-4 bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)]">
          <p className="font-mono text-sm font-semibold mb-3 text-[var(--color-danger-strong)]">
            {t('settings.deleteData.confirmWarning')}
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setStep('password')}
              className="font-mono text-sm px-5 py-2 rounded-md text-[var(--color-solid-text)] transition-colors bg-[var(--color-danger)]"
            >
              {t('settings.deleteData.confirmDelete')}
            </button>
            <button
              onClick={cancel}
              className="font-mono text-sm px-5 py-2 rounded-md bg-[var(--color-surface-strong)] transition-colors hover:bg-[var(--color-surface-hover)] border border-[var(--color-border)]"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      {step === 'password' && (
        <div className="rounded-lg p-4 bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)]">
          <p className="font-mono text-sm font-semibold mb-3 text-[var(--color-danger-strong)]">
            {t('settings.deleteData.passwordPrompt')}
          </p>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={t('settings.deleteData.passwordPlaceholder')}
              className="font-mono text-sm px-3 py-2 bg-[var(--color-surface-strong)] w-full sm:w-64 border border-[var(--color-border)] rounded-md outline-none"
              onKeyDown={e => e.key === 'Enter' && void handleDelete()}
              autoFocus
            />
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="font-mono text-sm px-5 py-2 rounded-md text-[var(--color-solid-text)] transition-colors disabled:opacity-50 bg-[var(--color-danger)]"
            >
              {deleting ? t('common.deleting') : t('settings.deleteData.confirmDelete')}
            </button>
            <button
              onClick={cancel}
              className="font-mono text-sm px-5 py-2 rounded-md bg-[var(--color-surface-strong)] transition-colors hover:bg-[var(--color-surface-hover)] border border-[var(--color-border)]"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      {msg && (
        <p
          className={`font-mono text-sm mt-3 ${isError ? 'text-[var(--color-danger-text)]' : 'text-[var(--color-ink-muted)]'}`}
        >
          {msg}
        </p>
      )}
    </Card>
  )
}
