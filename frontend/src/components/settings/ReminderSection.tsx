import { useState, useEffect } from 'react'
import { Card } from '../../components/Card'
import { useSettings, useSaveSettings } from '../../lib/queries'
import { usePushNotifications } from '../../lib/usePushNotifications'
import { useToast } from '../../lib/toast-context'

export function ReminderSection() {
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
      toastSuccess('已保存')
    } catch {
      toastError('保存失败')
    }
  }

  return (
    <Card title="下班提醒">
      <p className="text-sm mb-4 font-serif text-[var(--color-ink-muted)]">
        上班打卡后，系统将在设定时长后发送浏览器通知提醒你下班打卡。
      </p>
      {isSuccess && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <label className="font-mono text-sm text-[var(--color-ink)] whitespace-nowrap">
              打卡后延迟
            </label>
            <select
              value={delay}
              onChange={e => setDelay(e.target.value)}
              className="font-mono text-sm px-3 py-2 rounded-md bg-[var(--color-surface-strong)] w-full sm:w-auto border border-[var(--color-border)]"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(h => (
                <option key={h} value={String(h)}>
                  {h} 小时（09:00 → {String(9 + h).padStart(2, '0')}:00）
                </option>
              ))}
            </select>
            <button
              onClick={handleSaveDelay}
              disabled={saveMut.isPending}
              className="font-mono text-sm px-5 py-2 rounded-md text-[var(--color-solid-text)] transition-colors disabled:opacity-50 bg-[var(--color-solid)]"
            >
              保存
            </button>
          </div>

          <div className="flex items-center gap-3">
            {!('Notification' in window) ? (
              <p className="text-sm font-mono text-[var(--color-ink-muted)]">
                当前浏览器不支持通知功能
              </p>
            ) : permission === 'denied' ? (
              <p className="text-sm font-mono text-[var(--color-danger-text)]">
                通知权限已被拒绝，请在浏览器设置中手动开启。
              </p>
            ) : subscribed ? (
              <>
                <span className="text-sm font-mono text-[var(--color-ink-muted)]">
                  通知已开启
                </span>
                <button
                  onClick={unsubscribe}
                  disabled={loading}
                  className="font-mono text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-50 text-[var(--color-danger-text)] border border-[var(--color-danger-border)]"
                >
                  关闭通知
                </button>
              </>
            ) : (
              <button
                onClick={subscribe}
                disabled={loading}
                className="font-mono text-sm px-5 py-2 rounded-md text-[var(--color-solid-text)] transition-colors disabled:opacity-50 bg-[var(--color-solid)]"
              >
                {loading ? '请求中...' : '开启推送通知'}
              </button>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}
