import { formatTime, formatDateFull } from './date-utils'
import type { Todo } from './api'

/** Format a single day's data as markdown */
export function formatDayMarkdown(
  date: string,
  att: any,
  logContent: string,
  completedTodos: Todo[],
  lessonContent: string,
): string {
  const lines: string[] = []
  lines.push(`## ${formatDateFull(date)}`)
  lines.push('')
  if (att) {
    if (att.status === 'leave') {
      lines.push(`> 状态：请假`)
    } else {
      lines.push(`> 上班 ${formatTime(att.clock_in)}　下班 ${formatTime(att.clock_out)}`)
    }
    lines.push('')
  }
  if (logContent.trim()) {
    lines.push('### 工作内容')
    lines.push('')
    lines.push(logContent.trim())
    lines.push('')
  }
  if (completedTodos.length > 0) {
    lines.push('### 已完成待办')
    lines.push('')
    completedTodos.forEach(t => {
      const url = t.url ? ` ${t.url}` : ''
      lines.push(`- [x] ${t.content}${url}`)
    })
    lines.push('')
  }
  if (lessonContent.trim()) {
    lines.push('### 经验教训')
    lines.push('')
    lines.push(lessonContent.trim())
    lines.push('')
  }
  return lines.join('\n')
}
