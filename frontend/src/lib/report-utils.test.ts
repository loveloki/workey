import { describe, it, expect } from 'vitest'
import { formatDayMarkdown } from './report-utils'
import type { Todo } from './api'

// 测试 Feature：将一天的工作数据格式化为可复制的 Markdown 文本
describe('formatDayMarkdown', () => {
  function makeTodo(content: string, url = ''): Todo {
    return { id: 1, user_id: 1, content, url, done: true, created_at: '', updated_at: '' }
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
})
