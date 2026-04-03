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

// --- Iteration utilities ---
// Iteration 1 starts on 2019-09-02 (Monday). Each iteration is 2 weeks (14 days).
// An iteration spans from Monday of week 1 to Friday of week 2 (12 calendar days).
const ITER_EPOCH = new Date('2019-09-02T00:00:00') // Monday

export function getIterationNumber(date: Date): number {
  const diffMs = date.getTime() - ITER_EPOCH.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  return Math.floor(diffDays / 14) + 1
}

export function getIterationRange(iterNum: number): { start: string; end: string; label: string } {
  const startDate = new Date(ITER_EPOCH)
  startDate.setDate(startDate.getDate() + (iterNum - 1) * 14)
  const endDate = new Date(startDate)
  endDate.setDate(endDate.getDate() + 11) // Monday + 11 = Friday of week 2
  const sm = startDate.getMonth() + 1
  const sd = startDate.getDate()
  const em = endDate.getMonth() + 1
  const ed = endDate.getDate()
  return {
    start: formatDate(startDate),
    end: formatDate(endDate),
    label: `Iter${iterNum} (${sm}.${sd}–${em}.${ed})`,
  }
}

export function getCurrentIteration(): number {
  return getIterationNumber(new Date())
}
