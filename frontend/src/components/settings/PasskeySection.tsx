import { useState } from 'react'
import { passkeys as passkeysApi, base64urlToBuffer } from '../../lib/api'
import { Card } from '../../components/Card'
import { usePasskeyList, useDeletePasskey } from '../../lib/queries'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../../lib/queries'

export function PasskeySection() {
  const [name, setName] = useState('')
  const [adding, setAdding] = useState(false)
  const [msg, setMsg] = useState('')
  const [isError, setIsError] = useState(false)
  const { data, isLoading } = usePasskeyList()
  const deleteMut = useDeletePasskey()
  const qc = useQueryClient()

  const passkeyList = data?.passkeys ?? []

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
        pubKeyCredParams: options.pubKeyCredParams.map(p => ({
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
        excludeCredentials: (options.excludeCredentials ?? []).map(c => ({
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
      qc.invalidateQueries({ queryKey: queryKeys.passkeys })
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : '添加通行密钥失败')
      setIsError(true)
    } finally {
      setAdding(false)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await deleteMut.mutateAsync(id)
      setMsg('通行密钥已删除')
      setIsError(false)
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : '删除失败')
      setIsError(true)
    }
  }

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '从未使用'
    const d = new Date(dateStr.replace(' ', 'T') + 'Z')
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' })
  }

  return (
    <Card title="通行密钥">
      <p className="text-sm mb-4 font-serif text-[var(--color-ink-muted)]">
        通行密钥让你无需输入密码即可登录，支持指纹、面容识别等方式。
      </p>

      {isLoading ? (
        <p className="font-mono text-sm text-[var(--color-ink-muted)]">
          加载中...
        </p>
      ) : (
        <>
          {passkeyList.length > 0 && (
            <div className="space-y-3 mb-4">
              {passkeyList.map(pk => (
                <div
                  key={pk.id}
                  className="flex items-center justify-between py-2.5 px-3 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)]"
                >
                  <div>
                    <div className="font-mono text-sm font-semibold text-[var(--color-ink)]">
                      {pk.name}
                    </div>
                    <div className="font-mono text-xs text-[var(--color-ink-muted)]">
                      添加于 {formatDate(pk.created_at)} · 上次使用 {formatDate(pk.last_used_at)}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(pk.id)}
                    className="font-mono text-sm px-3 py-1 rounded-md transition-colors text-[var(--color-danger-text)] border border-[var(--color-danger-border)]"
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
              onChange={e => setName(e.target.value)}
              placeholder="通行密钥名称（如 MacBook、iPhone）"
              className="font-mono text-sm px-3 py-2 bg-[var(--color-surface-strong)] w-full sm:w-72 border border-[var(--color-border)] rounded-md outline-none"
              onKeyDown={e => e.key === 'Enter' && void handleAdd()}
            />
            <button
              onClick={handleAdd}
              disabled={adding}
              className="font-mono text-sm px-5 py-2 rounded-md text-[var(--color-solid-text)] transition-colors disabled:opacity-50 bg-[var(--color-solid)]"
            >
              {adding ? '添加中...' : '添加通行密钥'}
            </button>
          </div>

          {msg && (
            <p
              className={`font-mono text-sm mt-3 ${isError ? 'text-[var(--color-danger-text)]' : 'text-[var(--color-ink-muted)]'}`}
            >
              {msg}
            </p>
          )}
        </>
      )}
    </Card>
  )
}
