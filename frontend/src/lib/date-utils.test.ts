import { describe, it, expect, afterEach } from 'vitest'
import { setModuleLanguage } from './i18n'
import {
  formatDate,
  getDateRange,
  formatTime,
  formatDateDisplay,
  formatDateFull,
  formatTodayTitle,
  makeIterationConfig,
  computeIterations,
  getIterationNumber,
  getIterationRange,
  type IterationConfig,
  type IterationOverrideMap,
} from './date-utils'

// ─── formatDate ─────────────────────────────────────────────────
// check 函数：将 Date 对象格式化为 YYYY-MM-DD 字符串
describe('formatDate', () => {
  function check(year: number, month: number, day: number, expected: string) {
    const result = formatDate(new Date(year, month - 1, day))
    expect(result).toBe(expected)
  }

  it('普通日期', () => {
    check(2026, 5, 15, '2026-05-15')
    check(2024, 1, 1, '2024-01-01')
    check(2023, 12, 31, '2023-12-31')
  })

  it('月份和日期补零', () => {
    check(2026, 1, 9, '2026-01-09')
    check(2026, 9, 1, '2026-09-01')
  })

  it('边界值：闰年 2 月 29 日', () => {
    check(2024, 2, 29, '2024-02-29')
  })
})

// ─── formatTime ─────────────────────────────────────────────────
// check 函数：将 datetime 字符串格式化为 HH:MM
describe('formatTime', () => {
  function check(input: string | null | undefined, expected: string) {
    const result = formatTime(input)
    expect(result).toBe(expected)
  }

  it('空值返回 --:--', () => {
    check(null, '--:--')
    check(undefined, '--:--')
    check('', '--:--')
  })

  it('无效日期返回 --:--', () => {
    check('not-a-date', '--:--')
    check('2026-13-01T10:00:00', '--:--')
  })

  it('ISO 格式时间解析', () => {
    // 注意：toLocaleTimeString 的输出依赖运行时环境的时区
    // 这里测试函数不返回 '--:--' 即可证明解析成功
    const result = formatTime('2026-05-15T08:30:00Z')
    expect(result).not.toBe('--:--')
    expect(result).toMatch(/^\d{2}:\d{2}$/)
  })

  it('空格分隔格式解析', () => {
    const result = formatTime('2026-05-15 14:25:00')
    expect(result).not.toBe('--:--')
    expect(result).toMatch(/^\d{2}:\d{2}$/)
  })
})

// ─── formatDateDisplay ──────────────────────────────────────────
describe('formatDateDisplay', () => {
  function check(dateStr: string, expected: string) {
    expect(formatDateDisplay(dateStr)).toBe(expected)
  }

  it('格式化中文日期+星期缩写', () => {
    check('2026-05-15', '5月15日 周五')
    check('2026-01-01', '1月1日 周四')
    check('2024-02-29', '2月29日 周四')
    check('2026-05-11', '5月11日 周一')
    check('2026-05-17', '5月17日 周日')
  })
})

// ─── formatDateFull ─────────────────────────────────────────────
describe('formatDateFull', () => {
  function check(dateStr: string, expected: string) {
    expect(formatDateFull(dateStr)).toBe(expected)
  }

  it('完整中文日期格式', () => {
    check('2026-05-15', '2026年5月15日 星期五')
    check('2024-02-29', '2024年2月29日 星期四')
    check('2026-05-17', '2026年5月17日 星期日')
  })
})

// ─── getDateRange ───────────────────────────────────────────────
describe('getDateRange', () => {
  it('各 preset 返回合法日期范围', () => {
    const presets = ['week', 'month', 'quarter', 'half-year', 'year'] as const
    for (const preset of presets) {
      const range = getDateRange(preset)
      // start <= end
      expect(range.start <= range.end).toBe(true)
      // 格式正确
      expect(range.start).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(range.end).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('week preset 从周一开始', () => {
    const range = getDateRange('week')
    const startDate = new Date(range.start + 'T00:00:00')
    // getDay() === 1 表示周一
    expect(startDate.getDay()).toBe(1)
  })

  it('month preset 从 1 号开始', () => {
    const range = getDateRange('month')
    const startDate = new Date(range.start + 'T00:00:00')
    expect(startDate.getDate()).toBe(1)
  })

  it('year preset 从 1月1日 开始', () => {
    const range = getDateRange('year')
    const startDate = new Date(range.start + 'T00:00:00')
    expect(startDate.getMonth()).toBe(0)
    expect(startDate.getDate()).toBe(1)
  })
})

// ─── makeIterationConfig ────────────────────────────────────────
describe('makeIterationConfig', () => {
  function check(
    startDate: string | undefined,
    durationDays: string | undefined,
    expectedEpoch: string,
    expectedDuration: number,
  ) {
    const config = makeIterationConfig(startDate, durationDays)
    expect(formatDate(config.epoch)).toBe(expectedEpoch)
    expect(config.duration).toBe(expectedDuration)
  }

  it('使用默认值', () => {
    check(undefined, undefined, '2019-09-02', 14)
  })

  it('自定义起始日期和周期', () => {
    check('2025-01-01', '7', '2025-01-01', 7)
    check('2020-06-15', '21', '2020-06-15', 21)
  })

  it('无效输入回退到默认值', () => {
    check('invalid-date', '14', '2019-09-02', 14)
    check('2025-01-01', 'abc', '2025-01-01', 14)
    check('2025-01-01', '0', '2025-01-01', 14)
    check('2025-01-01', '-5', '2025-01-01', 14)
  })
})

// ─── Iteration 计算 ─────────────────────────────────────────────
describe('iteration computation', () => {
  const config: IterationConfig = {
    epoch: new Date('2025-01-01T00:00:00'),
    duration: 14,
  }

  describe('computeIterations - 无 override', () => {
    it('从第 1 个迭代开始计算', () => {
      const iters = computeIterations(1, 3, config)
      expect(iters).toHaveLength(3)
      expect(iters[0]).toEqual({ num: 1, start: '2025-01-01', end: '2025-01-14', isOverride: false })
      expect(iters[1]).toEqual({ num: 2, start: '2025-01-15', end: '2025-01-28', isOverride: false })
      expect(iters[2]).toEqual({ num: 3, start: '2025-01-29', end: '2025-02-11', isOverride: false })
    })

    it('从中间迭代开始', () => {
      const iters = computeIterations(3, 2, config)
      expect(iters).toHaveLength(2)
      expect(iters[0].num).toBe(3)
      expect(iters[0].start).toBe('2025-01-29')
    })
  })

  describe('computeIterations - 有 override', () => {
    const overrides: IterationOverrideMap = {
      2: { start: '2025-01-15', end: '2025-02-01' },
    }

    it('override 改变迭代范围并级联影响后续迭代', () => {
      const iters = computeIterations(1, 4, config, overrides)
      expect(iters[0]).toEqual({ num: 1, start: '2025-01-01', end: '2025-01-14', isOverride: false })
      expect(iters[1]).toEqual({ num: 2, start: '2025-01-15', end: '2025-02-01', isOverride: true })
      // 第 3 个迭代从 override 结束日期的下一天开始
      expect(iters[2].start).toBe('2025-02-02')
      expect(iters[2].isOverride).toBe(false)
    })
  })

  describe('getIterationNumber', () => {
    function check(dateStr: string, expected: number) {
      const date = new Date(dateStr + 'T00:00:00')
      expect(getIterationNumber(date, config)).toBe(expected)
    }

    it('epoch 当天属于第 1 迭代', () => {
      check('2025-01-01', 1)
    })

    it('第 1 迭代的最后一天', () => {
      check('2025-01-14', 1)
    })

    it('第 2 迭代的第一天', () => {
      check('2025-01-15', 2)
    })

    it('较远的日期', () => {
      // 第 3 迭代：2025-01-29 到 2025-02-11
      check('2025-02-01', 3)
    })
  })

  describe('getIterationRange', () => {
    it('返回正确的范围和 label', () => {
      const range = getIterationRange(1, config)
      expect(range.start).toBe('2025-01-01')
      expect(range.end).toBe('2025-01-14')
      expect(range.label).toBe('Iter1 (1.1–1.14)')
    })

    it('跨月的 label', () => {
      const range = getIterationRange(2, config)
      expect(range.start).toBe('2025-01-15')
      expect(range.end).toBe('2025-01-28')
      expect(range.label).toBe('Iter2 (1.15–1.28)')
    })
  })
})

// ─── 多语言日期格式 ─────────────────────────────
describe('日期格式跟随语言', () => {
  afterEach(() => setModuleLanguage('zh-CN'))

  it('formatDateDisplay 支持 lang 参数', () => {
    expect(formatDateDisplay('2026-05-15', 'zh-CN')).toBe('5月15日 周五')
    expect(formatDateDisplay('2026-05-15', 'en-US')).toBe('May 15 (Fri)')
    expect(formatDateDisplay('2026-01-01', 'en-US')).toBe('Jan 1 (Thu)')
  })

  it('formatDateFull 支持 lang 参数', () => {
    expect(formatDateFull('2026-05-15', 'zh-CN')).toBe('2026年5月15日 星期五')
    expect(formatDateFull('2026-05-15', 'en-US')).toBe('Friday, May 15, 2026')
  })

  it('不传 lang 时跟随当前语言', () => {
    setModuleLanguage('en-US')
    expect(formatDateDisplay('2026-05-15')).toBe('May 15 (Fri)')
    expect(formatDateFull('2026-05-15')).toBe('Friday, May 15, 2026')

    setModuleLanguage('zh-CN')
    expect(formatDateDisplay('2026-05-15')).toBe('5月15日 周五')
    expect(formatDateFull('2026-05-15')).toBe('2026年5月15日 星期五')
  })

  it('formatTime 在两种语言下均为 24 小时制', () => {
    expect(formatTime('2026-05-15 14:25:00', 'zh-CN')).toMatch(/^\d{2}:\d{2}$/)
    expect(formatTime('2026-05-15 14:25:00', 'en-US')).toMatch(/^\d{2}:\d{2}$/)
  })

  it('formatTodayTitle 跟随语言返回不同文本', () => {
    const date = new Date(2026, 4, 15)
    expect(formatTodayTitle(date, 'zh-CN')).toMatch(/[\u4e00-\u9fff]/)
    expect(formatTodayTitle(date, 'en-US')).toBe('Friday, May 15')
  })
})
