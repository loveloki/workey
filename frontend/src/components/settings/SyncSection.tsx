import { useState } from 'react'
import { Card } from '../Card'
import { useToast } from '../../lib/toast-context'
import { ApiError } from '../../lib/api'

// 判断是否为冲突错误（后端返回 HTTP 409）
function isConflictError(e: unknown): boolean {
  if (e instanceof ApiError) return e.status === 409
  if (e instanceof Error && "status" in e) return (e as { status: number }).status === 409
  return false
}

import {
  useSyncConfig,
  useSyncStatus,
  useSyncLogs,
  useSaveSyncConfig,
  useDeleteSyncConfig,
  useValidateSyncConfig,
  useSyncPush,
  useSyncPull,
} from '../../lib/queries'
import { useQueryClient } from '@tanstack/react-query'

// 冲突选择弹窗
function ConflictModal({
  onLocal,
  onRemote,
  onCancel,
  loading,
}: {
  onLocal: () => void
  onRemote: () => void
  onCancel: () => void
  loading: boolean
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50"
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="w-full max-w-md mx-4 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] shadow-2xl">
        <div className="px-6 py-5 border-b border-[var(--color-border)]">
          <h2 className="font-serif text-xl text-[var(--color-ink)]">检测到同步冲突</h2>
          <p className="mt-1 font-mono text-xs text-[var(--color-ink-muted)]">
            本地与远端数据存在差异，请选择保留哪一方
          </p>
        </div>
        <div className="px-6 py-5 space-y-3">
          <ConflictOption
            title="使用本地覆盖远端"
            desc="将本地数据推送到 WebDAV，远端旧数据将被替换"
            onClick={onLocal}
            disabled={loading}
            variant="danger"
          />
          <ConflictOption
            title="使用远端覆盖本地"
            desc="从 WebDAV 拉取数据，本地数据将被替换"
            onClick={onRemote}
            disabled={loading}
            variant="primary"
          />
        </div>
        <div className="flex justify-end px-6 pb-5">
          <button
            onClick={onCancel}
            disabled={loading}
            className="font-mono text-sm px-4 py-2 rounded-md border border-[var(--color-border)] text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)] disabled:opacity-50 transition-colors"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  )
}

function ConflictOption({
  title,
  desc,
  onClick,
  disabled,
  variant,
}: {
  title: string
  desc: string
  onClick: () => void
  disabled: boolean
  variant: 'primary' | 'danger'
}) {
  const base = 'w-full text-left rounded-lg border p-4 transition-colors disabled:opacity-50'
  const cls =
    variant === 'danger'
      ? `${base} border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] hover:bg-[var(--color-danger-bg)]`
      : `${base} border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)]`
  return (
    <button className={cls} onClick={onClick} disabled={disabled}>
      <p className="font-mono text-sm font-semibold text-[var(--color-ink)]">{title}</p>
      <p className="mt-0.5 font-mono text-xs text-[var(--color-ink-muted)]">{desc}</p>
    </button>
  )
}

// 同步日志条目
function SyncLogItem({ log }: { log: { id: number; direction: string; status: string; message: string; created_at: string } }) {
  const dirLabel = log.direction === 'push' ? '↑ 推送' : log.direction === 'pull' ? '↓ 拉取' : '🔍 检查'
  const statusColor =
    log.status === 'success'
      ? 'text-[var(--color-success-text)]'
      : log.status === 'conflict'
        ? 'text-[var(--color-ink-muted)]'
        : 'text-[var(--color-danger-text)]'

  const formatDate = (s: string) => {
    const d = new Date(s)
    if (isNaN(d.getTime())) return s
    return d.toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="flex items-start gap-3 py-2 border-b border-[var(--color-border-subtle)] last:border-0">
      <span className={`font-mono text-xs shrink-0 mt-0.5 ${statusColor}`}>{dirLabel}</span>
      <div className="flex-1 min-w-0">
        <p className="font-mono text-xs text-[var(--color-ink)] truncate">{log.message}</p>
        <p className="font-mono text-[10px] text-[var(--color-ink-faint)] mt-0.5">{formatDate(log.created_at)}</p>
      </div>
    </div>
  )
}

export function SyncSection() {
  const { toastSuccess, toastError } = useToast()
  const qc = useQueryClient()

  // 表单状态
  const [url, setUrl] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [remotePath, setRemotePath] = useState('/')
  const [showPassword, setShowPassword] = useState(false)

  // 冲突弹窗
  const [conflictModal, setConflictModal] = useState<null | 'push' | 'pull'>(null)
  const [conflictLoading, setConflictLoading] = useState(false)

  // 数据查询
  const configQuery = useSyncConfig()
  const statusQuery = useSyncStatus()
  const logsQuery = useSyncLogs()

  // 配置已保存时根据返回数据初始化表单（仅首次）
  const config = configQuery.data
  const isConfigured = config?.configured === true
  const [formInited, setFormInited] = useState(false)
  if (isConfigured && config && !formInited) {
    setUrl(config.webdav_url)
    setUsername(config.webdav_username)
    setRemotePath(config.remote_path)
    setFormInited(true)
  }

  // Mutations
  const saveConfig = useSaveSyncConfig()
  const deleteConfig = useDeleteSyncConfig()
  const validate = useValidateSyncConfig()
  const push = useSyncPush()
  const pull = useSyncPull()

  const formData = () => ({
    webdav_url: url.trim(),
    webdav_username: username.trim(),
    webdav_password: password,
    remote_path: remotePath.trim(),
  })

  const handleSave = async () => {
    const data = formData()
    if (!data.webdav_url || !data.webdav_username || !data.remote_path) {
      toastError('请填写 WebDAV 地址、用户名和远端目录')
      return
    }
    try {
      await saveConfig.mutateAsync(data)
      toastSuccess('配置已保存')
    } catch (e) {
      toastError(e instanceof Error ? e.message : '保存失败')
    }
  }

  const handleValidate = async () => {
    const data = formData()
    if (!data.webdav_url || !data.webdav_username || !data.remote_path) {
      toastError('请填写完整的 WebDAV 配置')
      return
    }
    try {
      const result = await validate.mutateAsync(data)
      if (result.success) {
        toastSuccess('连接成功：' + result.message)
      } else {
        toastError('连接失败：' + result.message)
      }
    } catch (e) {
      toastError(e instanceof Error ? e.message : '连接测试失败')
    }
  }

  const handleDelete = async () => {
    try {
      await deleteConfig.mutateAsync()
      setUrl('')
      setUsername('')
      setPassword('')
      setRemotePath('/')
      setFormInited(false)
      toastSuccess('配置已删除')
    } catch (e) {
      toastError(e instanceof Error ? e.message : '删除失败')
    }
  }

  // 触发同步（冲突由后端返回 HTTP 409）
  const handlePush = async () => {
    try {
      const result = await push.mutateAsync(false)
      toastSuccess('推送成功：' + result.message)
    } catch (e) {
      if (isConflictError(e)) {
        setConflictModal('push')
      } else {
        toastError(e instanceof Error ? e.message : '推送失败')
      }
    }
  }

  const handlePull = async () => {
    try {
      const result = await pull.mutateAsync(false)
      toastSuccess('拉取成功：' + result.message)
    } catch (e) {
      if (isConflictError(e)) {
        setConflictModal('pull')
      } else {
        toastError(e instanceof Error ? e.message : '拉取失败')
      }
    }
  }

  // 冲突解决：使用本地（force push）
  const handleConflictLocal = async () => {
    setConflictLoading(true)
    try {
      const result = await push.mutateAsync(true)
      toastSuccess('已以本地覆盖远端：' + result.message)
      setConflictModal(null)
    } catch (e) {
      toastError(e instanceof Error ? e.message : '强制推送失败')
    } finally {
      setConflictLoading(false)
    }
  }

  // 冲突解决：使用远端（force pull）
  const handleConflictRemote = async () => {
    setConflictLoading(true)
    try {
      const result = await pull.mutateAsync(true)
      toastSuccess('已以远端覆盖本地：' + result.message)
      setConflictModal(null)
    } catch (e) {
      toastError(e instanceof Error ? e.message : '强制拉取失败')
    } finally {
      setConflictLoading(false)
    }
  }

  const isBusy = push.isPending || pull.isPending || validate.isPending || saveConfig.isPending || deleteConfig.isPending
  const status = statusQuery.data
  const logs = logsQuery.data?.logs ?? []

  const formatDateTime = (s?: string | null) => {
    if (!s) return '从未'
    const d = new Date(s)
    if (isNaN(d.getTime())) return s
    return d.toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <>
      <Card title="WebDAV 同步">
        <p className="text-sm mb-5 font-serif text-[var(--color-ink-muted)]">
          将数据手动同步到 WebDAV 服务器。不支持自动同步；冲突时需手动选择保留哪一方。
        </p>

        {/* WebDAV 配置表单 */}
        <div className="space-y-3 mb-5">
          <div>
            <label className="block font-mono text-xs mb-1 text-[var(--color-ink-muted)]">
              WebDAV 地址
            </label>
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://dav.example.com"
              className="font-mono text-sm w-full px-3 py-2 bg-[var(--color-surface-strong)] border border-[var(--color-border)] rounded-md outline-none focus:border-[var(--color-border-focus)]"
              data-testid="sync-url"
            />
          </div>
          <div>
            <label className="block font-mono text-xs mb-1 text-[var(--color-ink-muted)]">
              用户名
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="your-username"
              className="font-mono text-sm w-full px-3 py-2 bg-[var(--color-surface-strong)] border border-[var(--color-border)] rounded-md outline-none focus:border-[var(--color-border-focus)]"
              data-testid="sync-username"
            />
          </div>
          <div>
            <label className="block font-mono text-xs mb-1 text-[var(--color-ink-muted)]">
              密码 / 应用密码
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={isConfigured ? '不修改则留空' : '请输入密码'}
                className="font-mono text-sm w-full px-3 py-2 pr-20 bg-[var(--color-surface-strong)] border border-[var(--color-border)] rounded-md outline-none focus:border-[var(--color-border-focus)]"
                data-testid="sync-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[10px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors px-1"
              >
                {showPassword ? '隐藏' : '显示'}
              </button>
            </div>
          </div>
          <div>
            <label className="block font-mono text-xs mb-1 text-[var(--color-ink-muted)]">
              远端目录
            </label>
            <input
              type="text"
              value={remotePath}
              onChange={e => setRemotePath(e.target.value)}
              placeholder="/workey"
              className="font-mono text-sm w-full px-3 py-2 bg-[var(--color-surface-strong)] border border-[var(--color-border)] rounded-md outline-none focus:border-[var(--color-border-focus)]"
              data-testid="sync-remote-path"
            />
          </div>
        </div>

        {/* 配置操作按钮 */}
        <div className="flex flex-wrap gap-2 mb-5">
          <button
            onClick={handleSave}
            disabled={isBusy}
            className="font-mono text-sm px-5 py-2 rounded-md bg-[var(--color-solid)] text-[var(--color-solid-text)] hover:bg-[var(--color-solid-hover)] disabled:opacity-50 transition-colors"
            data-testid="sync-save-btn"
          >
            {saveConfig.isPending ? '保存中...' : '保存配置'}
          </button>
          <button
            onClick={handleValidate}
            disabled={isBusy}
            className="font-mono text-sm px-5 py-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-strong)] hover:bg-[var(--color-surface-hover)] disabled:opacity-50 transition-colors"
            data-testid="sync-validate-btn"
          >
            {validate.isPending ? '测试中...' : '测试连接'}
          </button>
          {isConfigured && (
            <button
              onClick={handleDelete}
              disabled={isBusy}
              className="font-mono text-sm px-5 py-2 rounded-md border border-[var(--color-danger-border)] text-[var(--color-danger-text)] hover:bg-[var(--color-danger-bg)] disabled:opacity-50 transition-colors"
              data-testid="sync-delete-btn"
            >
              {deleteConfig.isPending ? '删除中...' : '删除配置'}
            </button>
          )}
        </div>

        {/* 同步操作 */}
        {isConfigured && (
          <>
            <div className="border-t border-[var(--color-border)] pt-4 mb-4">
              <p className="font-mono text-xs uppercase tracking-[0.15em] text-[var(--color-ink-muted)] mb-3">
                同步操作
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handlePush}
                  disabled={isBusy}
                  className="font-mono text-sm px-5 py-2 rounded-md bg-[var(--color-surface-strong)] border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] disabled:opacity-50 transition-colors"
                  data-testid="sync-push-btn"
                >
                  {push.isPending ? '推送中...' : '↑ 推送本地到远端'}
                </button>
                <button
                  onClick={handlePull}
                  disabled={isBusy}
                  className="font-mono text-sm px-5 py-2 rounded-md bg-[var(--color-surface-strong)] border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] disabled:opacity-50 transition-colors"
                  data-testid="sync-pull-btn"
                >
                  {pull.isPending ? '拉取中...' : '↓ 从远端拉取'}
                </button>
              </div>
            </div>

            {/* 同步状态 */}
            {status && (
              <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 mb-4">
                <p className="font-mono text-xs uppercase tracking-[0.15em] text-[var(--color-ink-muted)] mb-2">同步状态</p>
                <div className="grid grid-cols-2 gap-2 font-mono text-xs text-[var(--color-ink-secondary)]">
                  <span>上次同步：{formatDateTime(status.last_sync_at)}</span>
                  <span>同步方向：{status.last_direction === 'push' ? '↑ 推送' : status.last_direction === 'pull' ? '↓ 拉取' : '—'}</span>
                </div>
              </div>
            )}

            {/* 同步日志 */}
            {logs.length > 0 && (
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.15em] text-[var(--color-ink-muted)] mb-2">
                  近期日志
                </p>
                <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-1">
                  {logs.slice(0, 10).map(log => (
                    <SyncLogItem key={log.id} log={log} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {configQuery.isLoading && (
          <p className="font-mono text-sm text-[var(--color-ink-muted)]">加载中...</p>
        )}
      </Card>

      {/* 冲突选择弹窗 */}
      {conflictModal && (
        <ConflictModal
          onLocal={handleConflictLocal}
          onRemote={handleConflictRemote}
          onCancel={() => setConflictModal(null)}
          loading={conflictLoading}
        />
      )}
    </>
  )
}
