import { useRef, useLayoutEffect, type TextareaHTMLAttributes } from 'react'

export function useAutoGrow<T extends HTMLTextAreaElement>(value: string) {
  const ref = useRef<T | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }, [value])
  return ref
}

export function AutoTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useAutoGrow<HTMLTextAreaElement>(String(props.value ?? ''))
  return (
    <textarea
      ref={ref}
      {...props}
      style={{ ...(props.style || {}), overflow: 'hidden', resize: 'none' }}
    />
  )
}
