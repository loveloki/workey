import { useState } from 'react'
import { settings } from '../../lib/api'
import { Card } from '../../components/Card'

export function DeleteDataSection() {
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
      if (result.todo_count) parts.push(`${result.todo_count} 条待办`)
      setMsg(`已删除：${parts.join('，') || '无数据'}`)
      setIsError(false)
      setStep('idle')
      setPassword('')
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : '删除失败')
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
        删除所有数据（考勤、工作日志、待办事项），此操作不可恢复。
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
              onKeyDown={e => e.key === 'Enter' && void handleDelete()}
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
