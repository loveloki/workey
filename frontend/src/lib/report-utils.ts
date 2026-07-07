import type { Todo, Attendance } from './api'
import { formatTime } from './date-utils'

interface FormatOptions {
  /** 是否包含日期标题与上下班时间（用于历史导出，便于后续分析） */
  includeMeta?: boolean
}

/** 将一天的工作数据格式化为 Markdown 文本 */
export function formatDayMarkdown(
  date: string,
  att: Attendance | null,
  logContent: string,
  completedTodos: Todo[],
  options: FormatOptions = {},
): string {
  const lines: string[] = []

  if (options.includeMeta) {
    lines.push(`## ${date}`)
    if (att) {
      const parts: string[] = []
      if (att.status === 'leave') {
        parts.push('请假')
      } else {
        if (att.clock_in) parts.push(`上班 ${formatTime(att.clock_in)}`)
        if (att.clock_out) parts.push(`下班 ${formatTime(att.clock_out)}`)
        if (att.is_overtime) parts.push('加班')
      }
      if (parts.length > 0) lines.push(`> ${parts.join(' · ')}`)
    }
    lines.push('')
  }

  const body: string[] = []
  if (logContent.trim()) {
    body.push(logContent.trim())
  }
  if (completedTodos.length > 0) {
    if (body.length > 0) body.push('')
    completedTodos.forEach(t => {
      const url = t.url ? ` ${t.url}` : ''
      body.push(`- [x] ${t.content}${url}`)
    })
  }

  if (options.includeMeta && body.length === 0) {
    body.push('（未记录工作内容）')
  }

  return [...lines, ...body].join('\n')
}
