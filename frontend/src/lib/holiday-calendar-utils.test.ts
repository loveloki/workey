import { describe, expect, it } from 'vitest'
import { parseHolidayCalendar } from './holiday-calendar-utils'

describe('parseHolidayCalendar', () => {
  it('解析 holiday-cn 的 isOffDay 格式', () => {
    const result = parseHolidayCalendar(JSON.stringify({
      year: 2026,
      days: [
        { name: '春节', date: '2026-02-17', isOffDay: true },
        { name: '春节调休', date: '2026-02-14', isOffDay: false },
      ],
    }), '2026.json')

    expect(result).toEqual([
      { date: '2026-02-14', is_workday: true, name: '春节调休' },
      { date: '2026-02-17', is_workday: false, name: '春节' },
    ])
  })

  it('解析 CSV 并去重', () => {
    const result = parseHolidayCalendar(
      'date,is_workday,name\n2026/1/1,休,元旦\n2026-01-04,班,调休\n2026-01-01,false,元旦更新\n',
      'calendar.csv',
    )
    expect(result).toEqual([
      { date: '2026-01-01', is_workday: false, name: '元旦更新' },
      { date: '2026-01-04', is_workday: true, name: '调休' },
    ])
  })

  it('拒绝缺少日期类型的记录', () => {
    expect(() => parseHolidayCalendar('[{"date":"2026-01-01"}]')).toThrow('工作日/休息日标记')
  })

  it('解析 chinese-days 格式：只有 holidays', () => {
    const result = parseHolidayCalendar(JSON.stringify({
      holidays: {
        '2025-01-01': "New Year's Day,元旦,1",
        '2025-01-28': 'Spring Festival,春节,4',
        '2025-01-29': 'Spring Festival,春节,4',
      },
    }))

    expect(result).toEqual([
      { date: '2025-01-01', is_workday: false, name: '元旦' },
      { date: '2025-01-28', is_workday: false, name: '春节' },
      { date: '2025-01-29', is_workday: false, name: '春节' },
    ])
  })

  it('解析 chinese-days 格式：holidays + workdays', () => {
    const result = parseHolidayCalendar(JSON.stringify({
      holidays: {
        '2025-01-01': "New Year's Day,元旦,1",
        '2025-01-28': 'Spring Festival,春节,4',
        '2025-01-29': 'Spring Festival,春节,4',
      },
      workdays: {
        '2025-01-26': 'Spring Festival,春节,4',
        '2025-02-08': 'Spring Festival,春节,4',
      },
    }))

    expect(result).toEqual([
      { date: '2025-01-01', is_workday: false, name: '元旦' },
      { date: '2025-01-26', is_workday: true, name: '春节' },
      { date: '2025-01-28', is_workday: false, name: '春节' },
      { date: '2025-01-29', is_workday: false, name: '春节' },
      { date: '2025-02-08', is_workday: true, name: '春节' },
    ])
  })

  it('解析 chinese-days 格式：value 无逗号时直接用全部内容作为 name', () => {
    const result = parseHolidayCalendar(JSON.stringify({
      holidays: {
        '2025-01-01': '元旦',
      },
      workdays: {
        '2025-01-04': '调休上班',
      },
    }))

    expect(result).toEqual([
      { date: '2025-01-01', is_workday: false, name: '元旦' },
      { date: '2025-01-04', is_workday: true, name: '调休上班' },
    ])
  })

  it('解析 chinese-days 格式：同一天 holidays 和 workdays 共存时 workdays 优先', () => {
    const result = parseHolidayCalendar(JSON.stringify({
      holidays: {
        '2025-01-01': "New Year's Day,元旦,1",
      },
      workdays: {
        '2025-01-01': 'New Year,元旦调班,1',
      },
    }))

    expect(result).toEqual([
      { date: '2025-01-01', is_workday: true, name: '元旦调班' },
    ])
  })

  it('解析 chinese-days 格式：空对象抛出错误', () => {
    expect(() => parseHolidayCalendar('{}')).toThrow('JSON 需为数组，或包含 days 数组，或包含 holidays/workdays 字段')
  })

  it('解析 chinese-days 格式：只有不相关字段也抛出错误', () => {
    expect(() => parseHolidayCalendar(JSON.stringify({ foo: 'bar' }))).toThrow(
      'JSON 需为数组，或包含 days 数组，或包含 holidays/workdays 字段',
    )
  })
})
