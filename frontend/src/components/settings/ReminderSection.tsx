import { useState, useEffect } from 'react'
import { Card } from '../../components/Card'
import { useSettings, useSaveSettings } from '../../lib/queries'
import { usePushNotifications } from '../../lib/usePushNotifications'
import { useToast } from '../../lib/toast-context'
import { useI18n } from '../../lib/i18n'

export function ReminderSection() {
  const { t } = useI18n()
  const { data, isSuccess } = useSettings()
  const saveMut = useSaveSettings()
  const { permission, subscribed, loading, subscribe, unsubscribe } = usePushNotifications()
  const { toastSuccess, toastError } = useToast()
  const [delay, setDelay] = useState('9')

  useEffect(() => {
    if (data) setDelay(data.reminder_delay)
  }, [data])

  const handleSaveDelay = async () => {
    try {
      await saveMut.mutateAsync({ reminder_delay: delay })
      toastSuccess(t('common.saved'))
    } catch {
      toastError(t('common.saveFailed'))
    }
  }

  return (
    <Card title={t('reminder.title')}>
      <p className="text-sm mb-4 font-serif text-[var(--color-ink-muted)]">
        {t('reminder.desc')}
      </p>
      {isSuccess && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <label className="font-mono text-sm text-[var(--color-ink)] whitespace-nowrap">
              {t('reminder.delayLabel')}
            </label>
            <select
              value={delay}
              onChange={e => setDelay(e.target.value)}
              className="font-mono text-sm px-3 py-2 rounded-md bg-[var(--color-surface-strong)] w-full sm:w-auto border border-[var(--color-border)]"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(h => (
                <option key={h} value={String(h)}>
                  {t('reminder.hoursOption', { hours: h, end: String(9 + h).padStart(2, '0') })}
                </option>
              ))}
            </select>
            <button
              onClick={handleSaveDelay}
              disabled={saveMut.isPending}
              className="font-mono text-sm px-5 py-2 rounded-md text-[var(--color-solid-text)] transition-colors disabled:opacity-50 bg-[var(--color-solid)]"
            >
              {t('common.save')}
            </button>
          </div>

          <div className="flex items-center gap-3">
            {!('Notification' in window) ? (
              <p className="text-sm font-mono text-[var(--color-ink-muted)]">
                {t('reminder.unsupported')}
              </p>
            ) : permission === 'denied' ? (
              <p className="text-sm font-mono text-[var(--color-danger-text)]">
                {t('reminder.denied')}
              </p>
            ) : subscribed ? (
              <>
                <span className="text-sm font-mono text-[var(--color-ink-muted)]">
                  {t('reminder.enabled')}
                </span>
                <button
                  onClick={unsubscribe}
                  disabled={loading}
                  className="font-mono text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-50 text-[var(--color-danger-text)] border border-[var(--color-danger-border)]"
                >
                  {t('reminder.disable')}
                </button>
              </>
            ) : (
              <button
                onClick={subscribe}
                disabled={loading}
                className="font-mono text-sm px-5 py-2 rounded-md text-[var(--color-solid-text)] transition-colors disabled:opacity-50 bg-[var(--color-solid)]"
              >
                {loading ? t('reminder.requesting') : t('reminder.enablePush')}
              </button>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}
