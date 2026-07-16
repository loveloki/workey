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
    if (!list) throw new Error('JSON 需为数组，或包含 days 数组')
    days = list.map(normalizeItem)
  }

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
