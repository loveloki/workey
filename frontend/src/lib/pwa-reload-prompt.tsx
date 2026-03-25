import { useRegisterSW } from 'virtual:pwa-register/react'

export function PWAReloadPrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, r) {
      // Check for updates every hour
      if (r) {
        setInterval(() => {
          r.update()
        }, 60 * 60 * 1000)
      }
    },
    onRegisterError(error) {
      console.error('SW registration error', error)
    },
  })

  if (!needRefresh) return null

  return (
    <div
      className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 z-[100] flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg"
      style={{
        background: 'var(--color-surface-strong)',
        border: '1px solid var(--color-border)',
      }}
    >
      <span className="font-mono text-sm flex-1" style={{ color: 'var(--color-ink)' }}>
        新版本已可用
      </span>
      <button
        onClick={() => updateServiceWorker(true)}
        className="font-mono text-sm px-3 py-1.5 rounded-md transition-colors"
        style={{
          background: '#4fb8b2',
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        更新
      </button>
      <button
        onClick={() => setNeedRefresh(false)}
        className="font-mono text-sm px-2 py-1.5 rounded-md transition-colors"
        style={{
          color: 'var(--color-ink-muted)',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        关闭
      </button>
    </div>
  )
}
