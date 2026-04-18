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

export function getMonday(dateStr: string): Date {
  const d = new Date(dateStr + 'T00:00:00')
  const day = d.getDay() || 7
  d.setDate(d.getDate() - day + 1)
  return d
}

// Calculate iterations based on the earliest date in the system.
// We assume an iteration is exactly 14 days, starting on a Monday.
export function computeIterations(
  fromNum: number,
  count: number,
  epochStr: string,
): { num: number; start: string; end: string }[] {
  const epoch = getMonday(epochStr)
  const results: { num: number; start: string; end: string }[] = []
  
  for (let i = 0; i < count; i++) {
    const iterNum = fromNum + i
    const s = new Date(epoch)
    s.setDate(s.getDate() + (iterNum - 1) * 14)
    const e = new Date(s)
    e.setDate(e.getDate() + 13)
    results.push({ num: iterNum, start: formatDate(s), end: formatDate(e) })
  }
  return results
}

export function getIterationNumber(
  dateStr: string,
  epochStr: string,
): number {
  const epoch = getMonday(epochStr)
  const target = new Date(dateStr + 'T00:00:00')
  
  const diffTime = target.getTime() - epoch.getTime()
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
  if (diffDays < 0) {
     return Math.floor(diffDays / 14) + 1
  }
  return Math.floor(diffDays / 14) + 1
}

export function getIterationRange(
  iterNum: number,
  epochStr: string,
): { start: string; end: string; label: string } {
  const results = computeIterations(iterNum, 1, epochStr)
  const r = results[0]
  const sd = new Date(r.start + 'T00:00:00')
  const ed = new Date(r.end + 'T00:00:00')
  const sm = sd.getMonth() + 1, sday = sd.getDate()
  const em = ed.getMonth() + 1, eday = ed.getDate()
  return {
    start: r.start,
    end: r.end,
    label: `Iter${iterNum} (${sm}.${sday}–${em}.${eday})`,
  }
}

export function getCurrentIteration(epochStr: string): number {
  return getIterationNumber(formatDate(new Date()), epochStr)
}
