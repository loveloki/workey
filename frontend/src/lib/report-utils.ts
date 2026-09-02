import type { Todo, Attendance } from './api'
import { formatTime } from './date-utils'
import { getLanguage, translate, type Language } from './i18n'

interface FormatOptions {
  /** 是否包含日期标题与上下班时间（用于历史导出，便于后续分析） */
  includeMeta?: boolean
  /** 导出语言，默认跟随当前界面语言 */
  lang?: Language
}

/** 将一天的工作数据格式化为 Markdown 文本 */
export function formatDayMarkdown(
  date: string,
  att: Attendance | null,
  logContent: string,
  completedTodos: Todo[],
  options: FormatOptions = {},
): string {
  const lang = options.lang ?? getLanguage()
  const tr = (key: Parameters<typeof translate>[1]) => translate(lang, key)
  const lines: string[] = []

  if (options.includeMeta) {
    lines.push(`## ${date}`)
    if (att) {
      const parts: string[] = []
      if (att.status === 'leave') {
        parts.push(tr('report.leave'))
      } else {
        if (att.clock_in) parts.push(`${tr('report.clockIn')} ${formatTime(att.clock_in, lang)}`)
        if (att.clock_out) parts.push(`${tr('report.clockOut')} ${formatTime(att.clock_out, lang)}`)
        if (att.is_overtime) parts.push(tr('report.overtime'))
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
    body.push(tr('report.noContent'))
  }

  return [...lines, ...body].join('\n')
}
