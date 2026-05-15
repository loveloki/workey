import type { ReactNode } from 'react'

export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg p-5 sm:p-6 bg-[var(--color-surface-strong)] border border-[var(--color-border)]">
      <h2 className="font-mono text-xs uppercase tracking-[0.2em] mb-4 text-[var(--color-ink-secondary)]">
        {title}
      </h2>
      {children}
    </div>
  )
}
