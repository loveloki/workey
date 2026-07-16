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
})
