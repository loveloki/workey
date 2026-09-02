import { useState, useEffect, useRef } from 'react'
import { Card } from '../Card'
import { useToast } from '../../lib/toast-context'
import { ApiError } from '../../lib/api'
import { useI18n, type TranslationKey } from '../../lib/i18n'
import {
  useSyncConfig,
  useSyncStatus,
  useSyncLogs,
  useSaveSyncConfig,
  useDeleteSyncConfig,
  useValidateSyncConfig,
  useSyncCheck,
  useSyncPush,
  useSyncPull,
} from '../../lib/queries'
import { useQueryClient } from '@tanstack/react-query'

type TFunc = (key: TranslationKey, vars?: Record<string, string | number>) => string

// 判断是否为冲突错误（后端返回 HTTP 409）
function isConflictError(e: unknown): boolean {
  return e instanceof ApiError && e.status === 409
}

// 格式化日期时间为短格式（统一工具函数，避免重复定义）
function formatDateTime(s: string | null | undefined, locale: string, t: TFunc): string {
  if (!s) return t('sync.never')
  const d = new Date(s)
  if (isNaN(d.getTime())) return s
  return d.toLocaleString(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

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
  const { t } = useI18n()

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="conflict-dialog-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50"
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="w-full max-w-md mx-4 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] shadow-2xl">
        <div className="px-6 py-5 border-b border-[var(--color-border)]">
          <h2 id="conflict-dialog-title" className="font-serif text-xl text-[var(--color-ink)]">{t('sync.conflict.title')}</h2>
          <p className="mt-1 font-mono text-xs text-[var(--color-ink-muted)]">
            {t('sync.conflict.desc')}
          </p>
        </div>
        <div className="px-6 py-5 space-y-3">
          <ConflictOption
            title={loading ? t('sync.conflict.running') : t('sync.conflict.useLocal')}
            desc={t('sync.conflict.useLocalDesc')}
            onClick={onLocal}
            disabled={loading}
            variant="danger"
          />
          <ConflictOption
            title={loading ? t('sync.conflict.running') : t('sync.conflict.useRemote')}
            desc={t('sync.conflict.useRemoteDesc')}
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
            {t('common.cancel')}
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
  const { t, locale } = useI18n()
  const dirLabel = log.direction === 'push' ? t('sync.log.push') : log.direction === 'pull' ? t('sync.log.pull') : t('sync.log.check')
  const statusColor =
    log.status === 'success'
      ? 'text-[var(--color-success-text)]'
      : log.status === 'conflict'
        ? 'text-[var(--color-ink-muted)]'
        : 'text-[var(--color-danger-text)]'

  return (
    <div role="listitem" className="flex items-start gap-3 py-2 border-b border-[var(--color-border-subtle)] last:border-0">
      <span className={`font-mono text-xs shrink-0 mt-0.5 ${statusColor}`}>{dirLabel}</span>
      <div className="flex-1 min-w-0">
        <p className="font-mono text-xs text-[var(--color-ink)] truncate">{log.message}</p>
        <p className="font-mono text-[10px] text-[var(--color-ink-faint)] mt-0.5">{formatDateTime(log.created_at, locale, t)}</p>
      </div>
    </div>
  )
}

export function SyncSection() {
  const { t, locale } = useI18n()
  const { toastSuccess, toastError } = useToast()
  const qc = useQueryClient()

  // 表单状态
  const [url, setUrl] = useState('')
  const [username, setUsername] = useState('')
  const passwordRef = useRef<HTMLInputElement>(null) // 使用 useRef 管理密码，避免在 React state 中暴露密码值
  const [remotePath, setRemotePath] = useState('/')
  const [autoSyncInterval, setAutoSyncInterval] = useState(0) // 0 = disabled
  const [showPassword, setShowPassword] = useState(false)
  const loginPasswordRef = useRef<HTMLInputElement>(null) // 当前登录密码，用于同步操作鉴权
  const [showLoginPassword, setShowLoginPassword] = useState(false)

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

  // 使用 useEffect 避免在渲染阶段直接 setState（修复 C3）
  useEffect(() => {
    if (isConfigured && config && !formInited) {
      setUrl(config.webdav_url)
      setUsername(config.webdav_username)
      setRemotePath(config.remote_path)
      setAutoSyncInterval(config.auto_sync_interval_minutes ?? 0)
      setFormInited(true)
    }
  }, [isConfigured, config, formInited])

  // Mutations
  const saveConfig = useSaveSyncConfig()
  const deleteConfig = useDeleteSyncConfig()
  const validate = useValidateSyncConfig()
  const check = useSyncCheck()
  const push = useSyncPush()
  const pull = useSyncPull()

  const formData = () => ({
    webdav_url: url.trim(),
    webdav_username: username.trim(),
    webdav_password: passwordRef.current?.value ?? '',
    remote_path: remotePath.trim(),
    auto_sync_interval_minutes: autoSyncInterval,
  })

  // 删除确认状态（修复 M10）
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  const handleSave = async () => {
    const data = formData()
    if (!data.webdav_url || !data.webdav_username || !data.remote_path) {
      toastError(t('sync.error.missingFields'))
      return
    }
    // 校验远端目录必须以 / 开头（修复 S5）
    if (!data.remote_path.startsWith('/')) {
      toastError(t('sync.error.pathMustStartWithSlash'))
      return
    }
    try {
      const result = await saveConfig.mutateAsync(data)
      // 检查返回的 warning 字段（主密钥设置失败等）
      if (result.warning) {
        toastError(result.warning)
      } else {
        toastSuccess(t('sync.configSaved'))
      }
      // 保存成功后清空密码字段（修复 M8）
      if (passwordRef.current) passwordRef.current.value = ''
    } catch (e) {
      toastError(e instanceof Error ? e.message : t('common.saveFailed'))
    }
  }

  const handleValidate = async () => {
    try {
      // 已配置状态下直接使用已保存的配置（密码从 DB 读取），无需重新输入
      const data = isConfigured ? undefined : formData()
      const result = await validate.mutateAsync(data)
      if (result.success) {
        toastSuccess(t('sync.connectSuccess', { message: result.message }))
      } else {
        toastError(t('sync.connectFailed', { message: result.message }))
      }
    } catch (e) {
      toastError(e instanceof Error ? e.message : t('sync.validateFailed'))
    }
  }

  const handleDelete = async () => {
    try {
      await deleteConfig.mutateAsync()
      setUrl('')
      setUsername('')
      if (passwordRef.current) passwordRef.current.value = ''
      setRemotePath('/')
      setAutoSyncInterval(0)
      setFormInited(false)
      setDeleteConfirm(false)
      toastSuccess(t('sync.configDeleted'))
    } catch (e) {
      toastError(e instanceof Error ? e.message : t('common.deleteFailed'))
    }
  }

  // 预检冲突，再决定是否执行同步
  const handlePush = async () => {
    try {
      const checkResult = await check.mutateAsync()
      if (checkResult.status === 'conflict') {
        setConflictModal('push')
        return
      }
      const result = await push.mutateAsync({ force: false, loginPassword: loginPasswordRef.current?.value })
      toastSuccess(t('sync.pushSuccess', { message: result.message }))
    } catch (e) {
      if (isConflictError(e)) {
        setConflictModal('push')
      } else {
        toastError(e instanceof Error ? e.message : t('sync.pushFailed'))
      }
    }
  }

  const handlePull = async () => {
    try {
      const checkResult = await check.mutateAsync()
      if (checkResult.status === 'conflict') {
        setConflictModal('pull')
        return
      }
      const result = await pull.mutateAsync({ force: false, loginPassword: loginPasswordRef.current?.value })
      toastSuccess(t('sync.pullSuccess', { message: result.message }))
    } catch (e) {
      if (isConflictError(e)) {
        setConflictModal('pull')
      } else {
        toastError(e instanceof Error ? e.message : t('sync.pullFailed'))
      }
    }
  }

  // 冲突解决：使用本地（force push）
  const handleConflictLocal = async () => {
    setConflictLoading(true)
    try {
      const result = await push.mutateAsync({ force: true, loginPassword: loginPasswordRef.current?.value })
      toastSuccess(t('sync.forcePushDone', { message: result.message }))
      setConflictModal(null)
    } catch (e) {
      toastError(e instanceof Error ? e.message : t('sync.forcePushFailed'))
    } finally {
      setConflictLoading(false)
    }
  }

  // 冲突解决：使用远端（force pull）
  const handleConflictRemote = async () => {
    setConflictLoading(true)
    try {
      const result = await pull.mutateAsync({ force: true, loginPassword: loginPasswordRef.current?.value })
      toastSuccess(t('sync.forcePullDone', { message: result.message }))
      setConflictModal(null)
    } catch (e) {
      toastError(e instanceof Error ? e.message : t('sync.forcePullFailed'))
    } finally {
      setConflictLoading(false)
    }
  }

  const isBusy = push.isPending || pull.isPending || validate.isPending || saveConfig.isPending || deleteConfig.isPending
  const status = statusQuery.data
  const logs = logsQuery.data?.logs ?? []

  return (
    <>
      <Card title={t('sync.title')}>
        <p className="text-sm mb-5 font-serif text-[var(--color-ink-muted)]">
          {t('sync.desc')}
        </p>

        {/* WebDAV 配置表单 */}
        <div className="space-y-3 mb-5">
          <div>
            <label className="block font-mono text-xs mb-1 text-[var(--color-ink-muted)]">
              {t('sync.field.url')}
            </label>
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://dav.example.com"
              required
              className="font-mono text-sm w-full px-3 py-2 bg-[var(--color-surface-strong)] border border-[var(--color-border)] rounded-md outline-none focus:border-[var(--color-border-focus)]"
              data-testid="sync-url"
            />
          </div>
          <div>
            <label className="block font-mono text-xs mb-1 text-[var(--color-ink-muted)]">
              {t('sync.field.username')}
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
              {t('sync.field.password')}
            </label>
            <div className="relative">
              <input
                ref={passwordRef}
                type={showPassword ? 'text' : 'password'}
                defaultValue=""
                placeholder={isConfigured ? t('sync.password.placeholderConfigured') : t('sync.password.placeholder')}
                className="font-mono text-sm w-full px-3 py-2 pr-20 bg-[var(--color-surface-strong)] border border-[var(--color-border)] rounded-md outline-none focus:border-[var(--color-border-focus)]"
                data-testid="sync-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                aria-label={t('sync.password.toggleAria')}
                aria-pressed={showPassword}
                className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[10px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors px-1"
              >
                {showPassword ? t('sync.hide') : t('sync.show')}
              </button>
            </div>
          </div>
          <div>
            <label className="block font-mono text-xs mb-1 text-[var(--color-ink-muted)]">
              {t('sync.field.loginPassword')}
            </label>
            <div className="relative">
              <input
                ref={loginPasswordRef}
                type={showLoginPassword ? 'text' : 'password'}
                defaultValue=""
                placeholder={t('sync.loginPassword.placeholder')}
                className="font-mono text-sm w-full px-3 py-2 pr-20 bg-[var(--color-surface-strong)] border border-[var(--color-border)] rounded-md outline-none focus:border-[var(--color-border-focus)]"
                data-testid="sync-login-password"
              />
              <button
                type="button"
                onClick={() => setShowLoginPassword(v => !v)}
                aria-label={t('sync.loginPassword.toggleAria')}
                aria-pressed={showLoginPassword}
                className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[10px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors px-1"
              >
                {showLoginPassword ? t('sync.hide') : t('sync.show')}
              </button>
            </div>
          </div>
          <div>
            <label className="block font-mono text-xs mb-1 text-[var(--color-ink-muted)]">
              {t('sync.field.remotePath')}
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

          {/* 自动同步设置 */}
          <div className="pt-2 border-t border-[var(--color-border-subtle)]">
            <label className="flex items-center gap-3 cursor-pointer group">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={autoSyncInterval > 0}
                  onChange={e => setAutoSyncInterval(e.target.checked ? 60 : 0)}
                  className="sr-only peer"
                  data-testid="sync-auto-toggle"
                />
                <div className="w-9 h-5 rounded-full bg-[var(--color-surface-strong)] border border-[var(--color-border)] peer-checked:bg-[var(--color-solid)] peer-checked:border-[var(--color-solid)] transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-4" />
              </div>
              <span className="font-mono text-sm text-[var(--color-ink)] select-none">
                {t('sync.auto.enable')}
              </span>
            </label>
            {autoSyncInterval > 0 && (
              <div className="mt-3 pl-11">
                <label className="block font-mono text-xs mb-1 text-[var(--color-ink-muted)]">
                  {t('sync.auto.interval')}
                </label>
                <select
                  value={autoSyncInterval}
                  onChange={e => setAutoSyncInterval(Number(e.target.value))}
                  className="font-mono text-sm w-full px-3 py-2 bg-[var(--color-surface-strong)] border border-[var(--color-border)] rounded-md outline-none focus:border-[var(--color-border-focus)]"
                  data-testid="sync-auto-interval"
                >
                  <option value={30}>{t('sync.auto.minutes', { count: 30 })}</option>
                  <option value={60}>{t('sync.auto.hours', { count: 1 })}</option>
                  <option value={120}>{t('sync.auto.hours', { count: 2 })}</option>
                  <option value={240}>{t('sync.auto.hours', { count: 4 })}</option>
                  <option value={360}>{t('sync.auto.hours', { count: 6 })}</option>
                  <option value={720}>{t('sync.auto.hours', { count: 12 })}</option>
                  <option value={1440}>{t('sync.auto.hours', { count: 24 })}</option>
                </select>
                <p className="mt-1 font-mono text-[10px] text-[var(--color-ink-muted)]">
                  {t('sync.auto.hint')}
                </p>
              </div>
            )}
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
            {saveConfig.isPending ? t('common.saving') : t('sync.saveConfig')}
          </button>
          <button
            onClick={handleValidate}
            disabled={isBusy}
            className="font-mono text-sm px-5 py-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-strong)] hover:bg-[var(--color-surface-hover)] disabled:opacity-50 transition-colors"
            data-testid="sync-validate-btn"
          >
            {validate.isPending ? t('sync.testing') : t('sync.testConnection')}
          </button>
          {isConfigured && (
            <>
              <button
                onClick={() => setDeleteConfirm(true)}
                disabled={isBusy}
                className="font-mono text-sm px-5 py-2 rounded-md border border-[var(--color-danger-border)] text-[var(--color-danger-text)] hover:bg-[var(--color-danger-bg)] disabled:opacity-50 transition-colors"
                data-testid="sync-delete-btn"
              >
                {deleteConfig.isPending ? t('common.deleting') : t('sync.deleteConfig')}
              </button>
              {/* 删除确认提示（修复 M10） */}
              {deleteConfirm && (
                <div className="w-full flex items-center gap-2 p-3 rounded-md border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)]">
                  <span className="font-mono text-xs text-[var(--color-danger-text)]">{t('sync.deleteConfirmText')}</span>
                  <button
                    onClick={handleDelete}
                    disabled={isBusy}
                    className="font-mono text-xs px-3 py-1 rounded-md bg-[var(--color-danger-text)] text-white hover:opacity-90 disabled:opacity-50 transition-colors"
                    data-testid="sync-delete-confirm-btn"
                  >
                    {t('sync.deleteConfirmBtn')}
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(false)}
                    disabled={isBusy}
                    className="font-mono text-xs px-3 py-1 rounded-md border border-[var(--color-border)] text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)] disabled:opacity-50 transition-colors"
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* 同步操作 */}
        {isConfigured && (
          <>
            <div className="border-t border-[var(--color-border)] pt-4 mb-4">
              <p className="font-mono text-xs uppercase tracking-[0.15em] text-[var(--color-ink-muted)] mb-3">
                {t('sync.actions')}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handlePush}
                  disabled={isBusy}
                  className="font-mono text-sm px-5 py-2 rounded-md bg-[var(--color-surface-strong)] border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] disabled:opacity-50 transition-colors"
                  data-testid="sync-push-btn"
                >
                  {push.isPending ? t('sync.pushing') : t('sync.pushBtn')}
                </button>
                <button
                  onClick={handlePull}
                  disabled={isBusy}
                  className="font-mono text-sm px-5 py-2 rounded-md bg-[var(--color-surface-strong)] border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] disabled:opacity-50 transition-colors"
                  data-testid="sync-pull-btn"
                >
                  {pull.isPending ? t('sync.pulling') : t('sync.pullBtn')}
                </button>
              </div>
            </div>

            {/* 同步状态 */}
            {status && (
              <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 mb-4">
                <p className="font-mono text-xs uppercase tracking-[0.15em] text-[var(--color-ink-muted)] mb-2">{t('sync.status')}</p>
                <div className="grid grid-cols-2 gap-2 font-mono text-xs text-[var(--color-ink-secondary)]">
                  <span>{t('sync.lastSync', { time: formatDateTime(status?.last_sync_at, locale, t) })}</span>
                  <span>{t('sync.direction', { dir: status?.last_direction === 'push' ? t('sync.log.push') : status?.last_direction === 'pull' ? t('sync.log.pull') : '—' })}</span>
                </div>
              </div>
            )}

            {/* 同步日志 */}
            {logs.length > 0 && (
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.15em] text-[var(--color-ink-muted)] mb-2">
                  {t('sync.recentLogs')}
                </p>
                <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-1">
                  {logs.slice(0, 10).map((log: { id: number; direction: string; status: string; message: string; created_at: string }) => (
                    <SyncLogItem key={log.id} log={log} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {configQuery.isLoading && (
          <p role="status" aria-live="polite" className="font-mono text-sm text-[var(--color-ink-muted)]">{t('common.loading')}</p>
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
