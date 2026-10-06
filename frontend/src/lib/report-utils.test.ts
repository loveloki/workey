import { describe, it, expect, afterEach } from 'vitest'
import { formatDayMarkdown } from './report-utils'
import { setModuleLanguage } from './i18n'
import type { Todo } from './api'

// 测试 Feature：将一天的工作数据格式化为可复制的 Markdown 文本
describe('formatDayMarkdown', () => {
  function makeTodo(content: string, url = ''): Todo {
    return { id: 't1', user_id: 'u1', content, url, done: true, created_at: '', updated_at: '' }
  }

  // check 函数：统一调用签名，降低测试摩擦
  function check(logContent: string, todos: Todo[], expected: string) {
    const result = formatDayMarkdown('2026-05-15', null, logContent, todos)
    expect(result).toBe(expected)
  }

  it('仅有工作日志', () => {
    check('做了 A 和 B', [], '做了 A 和 B')
  })

  it('仅有已完成 todos', () => {
    check('', [makeTodo('修复 bug'), makeTodo('写文档')], '- [x] 修复 bug\n- [x] 写文档')
  })

  it('同时有日志和 todos', () => {
    check(
      '主要工作内容',
      [makeTodo('task1')],
      '主要工作内容\n\n- [x] task1',
    )
  })

  it('todo 带 url', () => {
    check('', [makeTodo('PR review', 'https://github.com/pr/1')], '- [x] PR review https://github.com/pr/1')
  })

  it('空输入返回空字符串', () => {
    check('', [], '')
  })

  it('日志前后空白被 trim', () => {
    check('  \n 内容 \n  ', [], '内容')
  })

  describe('includeMeta 选项（历史导出）', () => {
    const att = {
      id: 'a1', user_id: 'u1', date: '2026-05-15',
      clock_in: '2026-05-15T09:05:00+08:00',
      clock_out: '2026-05-15T18:30:00+08:00',
      status: 'normal', is_overtime: false, created_at: '', updated_at: '',
    } as never

    it('包含日期标题与上下班时间', () => {
      const result = formatDayMarkdown('2026-05-15', att, '内容', [], { includeMeta: true })
      expect(result).toMatch(/^## 2026-05-15\n> 上班 \d{2}:\d{2} · 下班 \d{2}:\d{2}\n\n内容$/)
    })

    it('无考勤时仅包含日期标题', () => {
      const result = formatDayMarkdown('2026-05-15', null, '内容', [], { includeMeta: true })
      expect(result).toBe('## 2026-05-15\n\n内容')
    })

    it('请假显示请假标记', () => {
      const leave = { ...(att as object), status: 'leave' } as never
      const result = formatDayMarkdown('2026-05-15', leave, '', [], { includeMeta: true })
      expect(result).toBe('## 2026-05-15\n> 请假\n\n（未记录工作内容）')
    })

    it('出差显示出差标记', () => {
      const businessTrip = { ...(att as object), status: 'business_trip', clock_out: null } as never
      const result = formatDayMarkdown('2026-05-15', businessTrip, '', [], { includeMeta: true })
      expect(result).toBe('## 2026-05-15\n> 出差\n\n（未记录工作内容）')
    })
  })
})

// 导出文案跟随语言
describe('formatDayMarkdown 多语言', () => {
  const att = {
    id: 'a1', user_id: 'u1', date: '2026-05-15',
    clock_in: '2026-05-15T09:05:00+08:00',
    clock_out: '2026-05-15T18:30:00+08:00',
    status: 'normal', is_overtime: true, created_at: '', updated_at: '',
  } as never

  afterEach(() => setModuleLanguage('zh-CN'))

  it('通过 lang 选项导出英文元信息', () => {
    const result = formatDayMarkdown('2026-05-15', att, 'Did A and B', [], { includeMeta: true, lang: 'en-US' })
    expect(result).toMatch(/^## 2026-05-15\n> In \d{2}:\d{2} · Out \d{2}:\d{2} · Overtime\n\nDid A and B$/)
  })

  it('英文下的请假与空内容提示', () => {
    const leave = { ...(att as object), status: 'leave' } as never
    const result = formatDayMarkdown('2026-05-15', leave, '', [], { includeMeta: true, lang: 'en-US' })
    expect(result).toBe('## 2026-05-15\n> On leave\n\n(No work recorded)')
  })

  it('未传 lang 时跟随当前界面语言', () => {
    setModuleLanguage('en-US')
    const result = formatDayMarkdown('2026-05-15', null, '', [], { includeMeta: true })
    expect(result).toBe('## 2026-05-15\n\n(No work recorded)')

    setModuleLanguage('zh-CN')
    const zhResult = formatDayMarkdown('2026-05-15', null, '', [], { includeMeta: true })
    expect(zhResult).toBe('## 2026-05-15\n\n（未记录工作内容）')
  })

  it('不含元信息时输出与语言无关', () => {
    const todos = [{ id: 't1', user_id: 'u1', content: 'task1', url: '', done: true, created_at: '', updated_at: '' } as Todo]
    expect(formatDayMarkdown('2026-05-15', att, 'log', todos, { lang: 'en-US' })).toBe(
      formatDayMarkdown('2026-05-15', att, 'log', todos, { lang: 'zh-CN' }),
    )
  })
})
