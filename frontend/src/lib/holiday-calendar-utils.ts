import type { HolidayCalendarImportDay } from './models.gen'

function normalizeDate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = value.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/)
  if (!match) return null
  const date = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
  const parsed = new Date(`${date}T00:00:00`)
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date ? null : date
}

function parseBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  if (['true', '1', 'yes', 'y', '班', '工作日', 'workday', 'working'].includes(normalized)) return true
  if (['false', '0', 'no', 'n', '休', '假日', '节假日', 'holiday', 'off'].includes(normalized)) return false
  return null
}

function normalizeItem(value: unknown, index: number): HolidayCalendarImportDay {
  if (!value || typeof value !== 'object') throw new Error(`第 ${index + 1} 条记录不是对象`)
  const item = value as Record<string, unknown>
  const date = normalizeDate(item.date ?? item.day)
  if (!date) throw new Error(`第 ${index + 1} 条记录缺少有效日期`)

  let isWorkday = parseBoolean(item.is_workday ?? item.isWorkday ?? item.workday)
  if (isWorkday === null && (item.isOffDay !== undefined || item.is_off_day !== undefined)) {
    const isOffDay = parseBoolean(item.isOffDay ?? item.is_off_day)
    if (isOffDay !== null) isWorkday = !isOffDay
  }
  if (isWorkday === null) isWorkday = parseBoolean(item.type ?? item.status)
  if (isWorkday === null) throw new Error(`第 ${index + 1} 条记录缺少工作日/休息日标记`)

  const nameValue = item.name ?? item.title ?? item.summary ?? ''
  return { date, is_workday: isWorkday, name: String(nameValue).trim() }
}

function parseCsvLine(line: string): string[] {
  const values: string[] = []
  let current = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        quoted = !quoted
      }
    } else if (char === ',' && !quoted) {
      values.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  values.push(current.trim())
  return values
}

function parseCsv(text: string): HolidayCalendarImportDay[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim())
  if (lines.length < 2) throw new Error('CSV 至少需要表头和一条数据')
  const headers = parseCsvLine(lines[0]).map(header => header.toLowerCase())
  const dateIndex = headers.findIndex(header => ['date', '日期'].includes(header))
  const workdayIndex = headers.findIndex(header => ['is_workday', 'isworkday', '工作日', '类型'].includes(header))
  const offDayIndex = headers.findIndex(header => ['isoffday', 'is_off_day', '休息日'].includes(header))
  const nameIndex = headers.findIndex(header => ['name', '名称', '节日'].includes(header))
  if (dateIndex < 0 || (workdayIndex < 0 && offDayIndex < 0)) {
    throw new Error('CSV 表头需包含 date 和 is_workday（或 isOffDay）')
  }

  return lines.slice(1).map((line, index) => {
    const values = parseCsvLine(line)
    const source: Record<string, unknown> = {
      date: values[dateIndex],
      name: nameIndex >= 0 ? values[nameIndex] : '',
    }
    if (workdayIndex >= 0) source.is_workday = values[workdayIndex]
    else source.isOffDay = values[offDayIndex]
    return normalizeItem(source, index)
  })
}

/**
 * 从 chinese-days 包的 value 中提取中文名。
 * 格式："英文名,中文名,天数" 或纯文本。
 */
function extractChineseName(value: string): string {
  const parts = value.split(',')
  if (parts.length >= 2) {
    return parts[1].trim()
  }
  return value.trim()
}

/**
 * 解析 chinese-days 包格式的 JSON：
 * { "holidays": { "2025-01-01": "New Year's Day,元旦,1" }, "workdays": { ... }, "inLieuDays": { ... } }
 */
function parseChineseDays(obj: Record<string, unknown>): HolidayCalendarImportDay[] {
  const result: HolidayCalendarImportDay[] = []

  if (obj.holidays && typeof obj.holidays === 'object' && !Array.isArray(obj.holidays)) {
    for (const [dateStr, value] of Object.entries(obj.holidays)) {
      const date = normalizeDate(dateStr)
      if (!date) continue
      result.push({ date, is_workday: false, name: extractChineseName(String(value)) })
    }
  }

  if (obj.inLieuDays && typeof obj.inLieuDays === 'object' && !Array.isArray(obj.inLieuDays)) {
    for (const [dateStr, value] of Object.entries(obj.inLieuDays)) {
      const date = normalizeDate(dateStr)
      if (!date) continue
      result.push({ date, is_workday: false, name: extractChineseName(String(value)) })
    }
  }

  if (obj.workdays && typeof obj.workdays === 'object' && !Array.isArray(obj.workdays)) {
    for (const [dateStr, value] of Object.entries(obj.workdays)) {
      const date = normalizeDate(dateStr)
      if (!date) continue
      result.push({ date, is_workday: true, name: extractChineseName(String(value)) })
    }
  }

  return result
}

export function parseHolidayCalendar(text: string, fileName = ''): HolidayCalendarImportDay[] {
  let days: HolidayCalendarImportDay[]
  const trimmed = text.trim()
  if (fileName.toLowerCase().endsWith('.csv') || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) {
    days = parseCsv(text)
  } else {
    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      throw new Error('JSON 文件格式无效')
    }
    const list = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).days)
        ? (parsed as { days: unknown[] }).days
        : null

    if (list) {
      days = list.map(normalizeItem)
    } else if (parsed && typeof parsed === 'object') {
      // 尝试 chinese-days 格式
      days = parseChineseDays(parsed as Record<string, unknown>)
      if (days.length === 0) {
        throw new Error('JSON 需为数组，或包含 days 数组，或包含 holidays/workdays/inLieuDays 字段')
      }
    } else {
      throw new Error('JSON 需为数组，或包含 days 数组，或包含 holidays/workdays/inLieuDays 字段')
    }
  }

  // 去重：后出现的同名日期覆盖前面的（保持原有行为）
  // chinese-days 格式中 workdays 在 holidays 之后处理，自然覆盖同日期假期
  const unique = new Map(days.map(day => [day.date, day]))
  return [...unique.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export function downloadHolidayCalendarTemplate() {
  const content = '\uFEFFdate,is_workday,name\n2026-01-01,false,元旦\n2026-01-04,true,元旦调休上班\n'
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'china-holiday-calendar-template.csv'
  link.click()
  URL.revokeObjectURL(url)
}
