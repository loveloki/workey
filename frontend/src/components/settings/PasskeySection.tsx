import { useState } from 'react'
import { passkeys as passkeysApi, base64urlToBuffer } from '../../lib/api'
import { Card } from '../../components/Card'
import { usePasskeyList, useDeletePasskey } from '../../lib/queries'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../../lib/queries'
import { useI18n } from '../../lib/i18n'

export function PasskeySection() {
  const { t, locale } = useI18n()
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
      setMsg(t('passkey.nameRequired'))
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
        setMsg(t('passkey.createCancelled'))
        setIsError(true)
        setAdding(false)
        return
      }

      await passkeysApi.registerFinish(name.trim(), credential)
      setMsg(t('passkey.added'))
      setIsError(false)
      setName('')
      qc.invalidateQueries({ queryKey: queryKeys.passkeys })
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : t('passkey.addFailed'))
      setIsError(true)
    } finally {
      setAdding(false)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await deleteMut.mutateAsync(id)
      setMsg(t('passkey.deleted'))
      setIsError(false)
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : t('common.deleteFailed'))
      setIsError(true)
    }
  }

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return t('passkey.neverUsed')
    const d = new Date(dateStr.replace(' ', 'T') + 'Z')
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' })
  }

  return (
    <Card title={t('passkey.title')}>
      <p className="text-sm mb-4 font-serif text-[var(--color-ink-muted)]">
        {t('passkey.desc')}
      </p>

      {isLoading ? (
        <p className="font-mono text-sm text-[var(--color-ink-muted)]">
          {t('common.loading')}
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
                      {t('passkey.meta', { created: formatDate(pk.created_at), lastUsed: formatDate(pk.last_used_at) })}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(pk.id)}
                    className="font-mono text-sm px-3 py-1 rounded-md transition-colors text-[var(--color-danger-text)] border border-[var(--color-danger-border)]"
                  >
                    {t('common.delete')}
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
              placeholder={t('passkey.namePlaceholder')}
              className="font-mono text-sm px-3 py-2 bg-[var(--color-surface-strong)] w-full sm:w-72 border border-[var(--color-border)] rounded-md outline-none"
              onKeyDown={e => e.key === 'Enter' && void handleAdd()}
            />
            <button
              onClick={handleAdd}
              disabled={adding}
              className="font-mono text-sm px-5 py-2 rounded-md text-[var(--color-solid-text)] transition-colors disabled:opacity-50 bg-[var(--color-solid)]"
            >
              {adding ? t('passkey.adding') : t('passkey.add')}
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
