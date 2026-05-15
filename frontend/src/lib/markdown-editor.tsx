import { useState, useRef, useCallback } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface MarkdownEditorProps {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
}

export function MarkdownEditor({ value, onChange, placeholder, rows = 6 }: MarkdownEditorProps) {
  const [preview, setPreview] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const insertAtCursor = useCallback((text: string) => {
    const ta = textareaRef.current
    if (!ta) {
      onChange(value + text)
      return
    }
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const newVal = value.substring(0, start) + text + value.substring(end)
    onChange(newVal)
    // Restore cursor position after React re-render
    requestAnimationFrame(() => {
      ta.selectionStart = ta.selectionEnd = start + text.length
      ta.focus()
    })
  }, [value, onChange])

  // Append text to the end of the document (used for list insertion)
  const appendAtEnd = useCallback((text: string) => {
    const trimmedEnd = value.replace(/\s+$/, '')
    const sep = trimmedEnd.length === 0 ? '' : '\n'
    const newVal = trimmedEnd + sep + text
    onChange(newVal)
    requestAnimationFrame(() => {
      const ta = textareaRef.current
      if (ta) {
        ta.selectionStart = ta.selectionEnd = newVal.length
        ta.focus()
      }
    })
  }, [value, onChange])

  // Toolbar formatting helpers
  const wrapSelection = useCallback((before: string, after: string) => {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const selected = value.substring(start, end)
    const wrapped = before + (selected || '文本') + after
    const newVal = value.substring(0, start) + wrapped + value.substring(end)
    onChange(newVal)
    requestAnimationFrame(() => {
      if (selected) {
        ta.selectionStart = start + before.length
        ta.selectionEnd = start + before.length + selected.length
      } else {
        ta.selectionStart = start + before.length
        ta.selectionEnd = start + before.length + 2
      }
      ta.focus()
    })
  }, [value, onChange])

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-1 mb-2 flex-wrap">
        <ToolbarBtn title="粗体" onClick={() => wrapSelection('**', '**')}>B</ToolbarBtn>
        <ToolbarBtn title="斜体" onClick={() => wrapSelection('*', '*')}><i>I</i></ToolbarBtn>
        <ToolbarBtn title="代码" onClick={() => wrapSelection('`', '`')}>&lt;/&gt;</ToolbarBtn>
        <ToolbarBtn title="链接" onClick={() => wrapSelection('[', '](url)')}>🔗</ToolbarBtn>
        <ToolbarBtn title="列表" onClick={() => appendAtEnd('- ')}>•</ToolbarBtn>
        <div className="flex-1" />
        <button
          onClick={() => setPreview(!preview)}
          className={`font-mono text-xs px-3 py-1 rounded transition-colors border border-[var(--color-border)] text-[var(--color-ink-secondary)] ${
            preview ? 'bg-[var(--color-surface-hover)]' : 'bg-[var(--color-surface-strong)]'
          }`}
        >
          {preview ? '编辑' : '预览'}
        </button>
      </div>

      {/* Editor / Preview */}
      {preview ? (
        <div
          className="markdown-body rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 min-h-[160px] font-serif"
        >
          {value ? (
            <MarkdownContent content={value} />
          ) : (
            <p className="text-[var(--color-ink-faint)] italic">无内容</p>
          )}
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-base text-[var(--color-ink-secondary)] placeholder:text-[var(--color-ink-faint)] focus:border-[var(--color-border-focus)] focus:outline-none resize-y font-mono text-sm leading-[1.6]"
          rows={rows}
        />
      )}

      <p className="mt-1 font-mono text-xs text-[var(--color-ink-faint)]">
        支持 Markdown
      </p>
    </div>
  )
}

/* Render markdown content (used in editor preview + history) */
export function MarkdownContent({ content }: { content: string }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      components={{
        img: ({ src, alt, className, ...props }) => (
          <img
            src={src}
            alt={alt || ''}
            {...props}
            className={['max-w-full rounded-md my-2', className].filter(Boolean).join(' ')}
            loading="lazy"
          />
        ),
        a: ({ href, children, className, ...props }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            {...props}
            className={['text-[var(--color-ink-secondary)] underline', className].filter(Boolean).join(' ')}
          >
            {children}
          </a>
        ),
      }}
    >
      {content}
    </Markdown>
  )
}

function ToolbarBtn({
  children,
  onClick,
  title,
  disabled,
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="font-mono text-sm w-8 h-8 flex items-center justify-center rounded transition-colors hover:bg-[var(--color-surface-hover)] disabled:opacity-40 border border-[var(--color-border)] bg-[var(--color-surface-strong)]"
    >
      {children}
    </button>
  )
}
