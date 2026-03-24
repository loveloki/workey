export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

export function getToday(): string {
  return formatDate(new Date())
}

export type RangePreset = 'week' | 'month' | 'quarter' | 'half-year' | 'year'

export function getDateRange(preset: RangePreset): { start: string; end: string } {
  const now = new Date()
  const end = formatDate(now)
  let start: Date

  switch (preset) {
    case 'week': {
      start = new Date(now)
      const day = start.getDay() || 7
      start.setDate(start.getDate() - day + 1) // Monday
      break
    }
    case 'month':
      start = new Date(now.getFullYear(), now.getMonth(), 1)
      break
    case 'quarter': {
      const q = Math.floor(now.getMonth() / 3)
      start = new Date(now.getFullYear(), q * 3, 1)
      break
    }
    case 'half-year': {
      const h = now.getMonth() < 6 ? 0 : 6
      start = new Date(now.getFullYear(), h, 1)
      break
    }
    case 'year':
      start = new Date(now.getFullYear(), 0, 1)
      break
  }

  return { start: formatDate(start), end }
}

export function formatTime(datetime: string | null | undefined): string {
  if (!datetime) return '--:--'
  // Handle ISO format (2026-03-11T10:05:45Z) or space format (2026-03-11 10:05:45)
  const d = new Date(datetime)
  if (isNaN(d.getTime())) return '--:--'
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export function formatDateDisplay(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00')
  const weekdays = ['日', '一', '二', '三', '四', '五', '六']
  const m = date.getMonth() + 1
  const d = date.getDate()
  const w = weekdays[date.getDay()]
  return `${m}月${d}日 周${w}`
}

export function formatDateFull(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00')
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
  const y = date.getFullYear()
  const m = date.getMonth() + 1
  const d = date.getDate()
  const w = weekdays[date.getDay()]
  return `${y}年${m}月${d}日 ${w}`
}
