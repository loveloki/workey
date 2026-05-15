import { useState } from 'react'

export function CopyButton({ getText, className = '' }: { getText: () => Promise<string> | string; className?: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    const text = await getText()
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={handleCopy}
      className={`font-mono text-xs px-3 py-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-hover)] shrink-0 whitespace-nowrap ${className}`}
      style={{ border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-ink-muted)' }}
      title="复制为 Markdown"
    >
      {copied ? '✓ 已复制' : (
        <span className="flex items-center gap-1">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          复制
        </span>
      )}
    </button>
  )
}
