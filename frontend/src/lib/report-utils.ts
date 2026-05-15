import type { Todo, Attendance } from './api'

/** Format a single day's data as markdown (content only, no date/attendance/lesson). */
export function formatDayMarkdown(
  _date: string,
  _att: Attendance | null,
  logContent: string,
  completedTodos: Todo[],
): string {
  const lines: string[] = []
  if (logContent.trim()) {
    lines.push(logContent.trim())
  }
  if (completedTodos.length > 0) {
    if (lines.length > 0) lines.push('')
    completedTodos.forEach(t => {
      const url = t.url ? ` ${t.url}` : ''
      lines.push(`- [x] ${t.content}${url}`)
    })
  }
  return lines.join('\n')
}
