import { useRegisterSW } from 'virtual:pwa-register/react'

export function PWAReloadPrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, r) {
      // Immediate update check on load
      r && r.update()
      
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
      className="fixed top-20 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 z-[100] flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg bg-[var(--color-surface-strong)] border border-[var(--color-border)]"
    >
      <span className="font-mono text-sm flex-1 text-[var(--color-ink)]">
        新版本已可用
      </span>
      <button
        onClick={() => {
          updateServiceWorker(true)
          // Add explicit fallback in case workbox isUpdate check fails
          if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('controllerchange', () => {
              window.location.reload()
            })
            // Fallback timeout just in case controllerchange doesn't fire
            setTimeout(() => window.location.reload(), 1000)
          } else {
            window.location.reload()
          }
        }}
        className="font-mono text-sm px-3 py-1.5 rounded-md transition-colors bg-[#4fb8b2] text-white border-none cursor-pointer"
      >
        更新
      </button>
      <button
        onClick={() => setNeedRefresh(false)}
        className="font-mono text-sm px-2 py-1.5 rounded-md transition-colors text-[var(--color-ink-muted)] bg-transparent border-none cursor-pointer"
      >
        关闭
      </button>
    </div>
  )
}
