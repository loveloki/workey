import type { ReactNode } from 'react'

interface PageHeaderProps {
  /** 小字眉题（分类标签） */
  eyebrow: string
  /** 页面主标题 */
  title: string
  /** 标题右侧的操作区（可选） */
  actions?: ReactNode
  /** 居中显示（打卡页使用） */
  centered?: boolean
}

/** 统一的页面标题：眉题 + 大标题，风格全站一致 */
export function PageHeader({ eyebrow, title, actions, centered }: PageHeaderProps) {
  const heading = (
    <div className={centered ? 'text-center' : ''}>
      <p className="mb-1 font-mono text-sm uppercase tracking-[0.3em] text-[var(--color-ink-secondary)]">
        {eyebrow}
      </p>
      <h1 className="font-serif text-3xl font-normal tracking-tight text-[var(--color-ink)] sm:text-4xl">
        {title}
      </h1>
    </div>
  )
  if (!actions) return <div className={centered ? 'mb-8' : 'mb-6'}>{heading}</div>
  return (
    <div className="mb-6 flex items-start justify-between gap-3">
      {heading}
      <div className="mt-2 shrink-0">{actions}</div>
    </div>
  )
}
