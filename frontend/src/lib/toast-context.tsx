import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react'

type ToastType = 'error' | 'success' | 'info'

interface ToastItem {
  id: number
  type: ToastType
  message: string
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void
  toastError: (message: string) => void
  toastSuccess: (message: string) => void
}

const ToastContext = createContext<ToastContextValue>({
  toast: () => {},
  toastError: () => {},
  toastSuccess: () => {},
})

export function useToast() {
  return useContext(ToastContext)
}

const DURATION = 3500

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(0)

  const remove = useCallback((id: number) => {
    setItems(prev => prev.filter(t => t.id !== id))
  }, [])

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = nextId.current++
    setItems(prev => [...prev, { id, type, message }])
    setTimeout(() => remove(id), DURATION)
  }, [remove])

  const toastError = useCallback((message: string) => toast(message, 'error'), [toast])
  const toastSuccess = useCallback((message: string) => toast(message, 'success'), [toast])

  return (
    <ToastContext.Provider value={{ toast, toastError, toastSuccess }}>
      {children}
      {/* Toast 容器 - 固定在屏幕底部中央 */}
      {items.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 pointer-events-none">
          {items.map(item => {
            const typeStyles: Record<ToastType, string> = {
              error: 'bg-[var(--color-danger-bg)] border-[var(--color-danger-border)] text-[var(--color-danger-text)]',
              success: 'bg-[var(--color-success-bg)] border-[var(--color-success-border)] text-[var(--color-success-text)]',
              info: 'bg-[var(--color-surface-strong)] border-[var(--color-border)] text-[var(--color-ink)]',
            }
            return (
            <div
              key={item.id}
              className={`pointer-events-auto animate-slide-up flex items-center gap-2 rounded-lg px-4 py-3 shadow-lg font-mono text-sm max-w-[min(90vw,420px)] border ${typeStyles[item.type]}`}
            >
              <span className="shrink-0">
                {item.type === 'error' ? '✕' : item.type === 'success' ? '✓' : 'ℹ'}
              </span>
              <span className="break-words">{item.message}</span>
              <button
                onClick={() => remove(item.id)}
                className="shrink-0 ml-2 opacity-50 hover:opacity-100 transition-opacity"
              >
                ×
              </button>
            </div>
            )
          })}
        </div>
      )}
    </ToastContext.Provider>
  )
}
