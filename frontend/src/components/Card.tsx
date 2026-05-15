import type { ReactNode } from 'react'

export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      className="rounded-lg p-5 sm:p-6"
      style={{
        background: 'var(--color-surface-strong)',
        border: '1px solid var(--color-border)',
        borderRadius: '8px',
      }}
    >
      <h2 className="font-mono text-xs uppercase tracking-[0.2em] mb-4" style={{ color: 'var(--color-ink-secondary)' }}>
        {title}
      </h2>
      {children}
    </div>
  )
}
