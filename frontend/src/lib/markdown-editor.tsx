import { useState, useRef, useCallback, type ChangeEvent, type DragEvent, type ClipboardEvent } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { uploadImage } from './api'

interface MarkdownEditorProps {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
}

export function MarkdownEditor({ value, onChange, placeholder, rows = 6 }: MarkdownEditorProps) {
  const [preview, setPreview] = useState(false)
  const [uploading, setUploading] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  const doUpload = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return
    setUploading(true)
    try {
      const res = await uploadImage(file)
      insertAtCursor(res.markdown + '\n')
    } catch (e: any) {
      alert('上传失败: ' + (e.message || '未知错误'))
    } finally {
      setUploading(false)
    }
  }, [insertAtCursor])

  const handlePaste = useCallback((e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) doUpload(file)
        return
      }
    }
  }, [doUpload])

  const handleDrop = useCallback((e: DragEvent<HTMLTextAreaElement>) => {
    const files = e.dataTransfer?.files
    if (!files?.length) return
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        e.preventDefault()
        doUpload(file)
        return
      }
    }
  }, [doUpload])

  const handleFileSelect = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) doUpload(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [doUpload])

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
        <ToolbarBtn title="列表" onClick={() => insertAtCursor('\n- ')}>•</ToolbarBtn>
        <div className="w-px h-5 bg-[#e5e5e5] mx-1" />
        <ToolbarBtn
          title="上传图片"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? '⏳' : '🖼'}
        </ToolbarBtn>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />
        <div className="flex-1" />
        <button
          onClick={() => setPreview(!preview)}
          className="font-mono text-xs px-3 py-1 rounded transition-colors"
          style={{
            border: '1px solid #e5e5e5',
            borderRadius: '4px',
            background: preview ? '#f0f0f0' : 'white',
            color: '#333',
          }}
        >
          {preview ? '编辑' : '预览'}
        </button>
      </div>

      {/* Editor / Preview */}
      {preview ? (
        <div
          className="markdown-body rounded-lg border border-black/10 bg-[#fffdf5] p-4 min-h-[160px]"
          style={{ fontFamily: 'Georgia, serif' }}
        >
          {value ? (
            <MarkdownContent content={value} />
          ) : (
            <p className="text-[#9ca3af] italic">无内容</p>
          )}
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          onPaste={handlePaste}
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          placeholder={placeholder}
          className="w-full rounded-lg border border-black/10 bg-[#fffdf5] p-4 text-base text-[#333] placeholder:text-[#9ca3af] focus:border-black focus:outline-none resize-y"
          style={{ fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace', fontSize: '14px', lineHeight: '1.6' }}
          rows={rows}
        />
      )}

      {uploading && (
        <p className="mt-1 font-mono text-xs text-[#666]">上传中...</p>
      )}
      <p className="mt-1 font-mono text-xs text-[#9ca3af]">
        支持 Markdown · 可粘贴或拖拽图片
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
        img: ({ src, alt, ...props }) => (
          <img
            src={src}
            alt={alt || ''}
            {...props}
            style={{ maxWidth: '100%', borderRadius: '6px', margin: '8px 0' }}
            loading="lazy"
          />
        ),
        a: ({ href, children, ...props }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" {...props}
            style={{ color: '#333', textDecoration: 'underline' }}>
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
      className="font-mono text-sm w-8 h-8 flex items-center justify-center rounded transition-colors hover:bg-[#f0f0f0] disabled:opacity-40"
      style={{ border: '1px solid #e5e5e5', borderRadius: '4px', background: 'white' }}
    >
      {children}
    </button>
  )
}
