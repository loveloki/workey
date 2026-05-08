export function formatDate(date: Date): string {
  // Use local components to avoid UTC offset day-shift bugs
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
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
// Configurable iteration settings: start date and duration in days.
// Supports per-iteration overrides that cascade to subsequent iterations.

export interface IterationConfig {
  epoch: Date      // first iteration starts on this date
  duration: number // days per iteration
}

export interface IterationOverrideMap {
  [iterNum: number]: { start: string; end: string }
}

const DEFAULT_ITER_CONFIG: IterationConfig = {
  epoch: new Date('2019-09-02T00:00:00'),
  duration: 14,
}

export function makeIterationConfig(startDate?: string, durationDays?: string): IterationConfig {
  const epoch = startDate ? new Date(startDate + 'T00:00:00') : DEFAULT_ITER_CONFIG.epoch
  const duration = durationDays ? parseInt(durationDays, 10) : DEFAULT_ITER_CONFIG.duration
  return {
    epoch: isNaN(epoch.getTime()) ? DEFAULT_ITER_CONFIG.epoch : epoch,
    duration: isNaN(duration) || duration < 1 ? DEFAULT_ITER_CONFIG.duration : duration,
  }
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function parseLocalDate(s: string): Date {
  return new Date(s + 'T00:00:00')
}

/** Compute a range of iterations, accounting for overrides that cascade. */
export function computeIterations(
  fromNum: number,
  count: number,
  config: IterationConfig = DEFAULT_ITER_CONFIG,
  overrides: IterationOverrideMap = {},
): { num: number; start: string; end: string; isOverride: boolean }[] {
  const results: { num: number; start: string; end: string; isOverride: boolean }[] = []
  let cursor = new Date(config.epoch)

  for (let i = 1; i <= fromNum + count - 1; i++) {
    let iterStart: string
    let iterEnd: string
    let isOverride = false

    if (overrides[i]) {
      iterStart = overrides[i].start
      iterEnd = overrides[i].end
      isOverride = true
      cursor = addDays(parseLocalDate(iterEnd), 1)
    } else {
      iterStart = formatDate(cursor)
      iterEnd = formatDate(addDays(cursor, config.duration - 1))
      cursor = addDays(cursor, config.duration)
    }

    if (i >= fromNum && results.length < count) {
      results.push({ num: i, start: iterStart, end: iterEnd, isOverride })
    }
  }
  return results
}

/** Find which iteration a date falls in (override-aware). */
export function getIterationNumber(
  date: Date,
  config: IterationConfig = DEFAULT_ITER_CONFIG,
  overrides: IterationOverrideMap = {},
): number {
  const target = formatDate(date)
  let cursor = new Date(config.epoch)

  for (let i = 1; i < 9999; i++) {
    let iterStart: string
    let iterEnd: string

    if (overrides[i]) {
      iterStart = overrides[i].start
      iterEnd = overrides[i].end
      cursor = addDays(parseLocalDate(iterEnd), 1)
    } else {
      iterStart = formatDate(cursor)
      iterEnd = formatDate(addDays(cursor, config.duration - 1))
      cursor = addDays(cursor, config.duration)
    }

    if (target >= iterStart && target <= iterEnd) return i
    if (target < iterStart) return i
  }
  return 1
}

/** Get the range for a specific iteration number (override-aware). */
export function getIterationRange(
  iterNum: number,
  config: IterationConfig = DEFAULT_ITER_CONFIG,
  overrides: IterationOverrideMap = {},
): { start: string; end: string; label: string } {
  const results = computeIterations(iterNum, 1, config, overrides)
  if (results.length === 0) {
    // fallback
    const s = addDays(config.epoch, (iterNum - 1) * config.duration)
    const e = addDays(s, config.duration - 1)
    return { start: formatDate(s), end: formatDate(e), label: `Iter${iterNum}` }
  }
  const r = results[0]
  const sd = parseLocalDate(r.start)
  const ed = parseLocalDate(r.end)
  const sm = sd.getMonth() + 1, sday = sd.getDate()
  const em = ed.getMonth() + 1, eday = ed.getDate()
  return {
    start: r.start,
    end: r.end,
    label: `Iter${iterNum} (${sm}.${sday}–${em}.${eday})`,
  }
}

export function getCurrentIteration(
  config: IterationConfig = DEFAULT_ITER_CONFIG,
  overrides: IterationOverrideMap = {},
): number {
  return getIterationNumber(new Date(), config, overrides)
}
