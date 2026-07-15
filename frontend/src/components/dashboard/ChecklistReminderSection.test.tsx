import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ToastProvider } from '../../lib/toast-context'
import { ChecklistReminderSection } from './ChecklistReminderSection'

vi.mock('../../lib/api', async importOriginal => {
  const actual = await importOriginal<typeof import('../../lib/api')>()
  return {
    ...actual,
    checklistReminders: {
      list: vi.fn(),
      save: vi.fn(),
    },
  }
})

import { checklistReminders } from '../../lib/api'

const dailyChecklist = {
  id: 1,
  user_id: 1,
  title: '每日上班检查',
  kind: 'daily_start',
  items: JSON.stringify([
    { text: '确认今日优先级' },
    { text: '检查紧急工单' },
  ]),
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

function renderSection() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ChecklistReminderSection date="2024-01-02" enabled />
      </ToastProvider>
    </QueryClientProvider>,
  )
}

describe('ChecklistReminderSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(checklistReminders.list).mockResolvedValue({
      reminders: [{
        kind: 'daily_start',
        occurrence_key: '2024-01-02',
        label: '上班后完成',
        due_date: '2024-01-02',
        checklist: dailyChecklist,
      }],
    } as never)
    vi.mocked(checklistReminders.save).mockResolvedValue({
      run: {
        id: 1,
        user_id: 1,
        checklist_id: 1,
        kind: 'daily_start',
        occurrence_key: '2024-01-02',
        title: '每日上班检查',
        items: dailyChecklist.items,
        data: JSON.stringify({ checked: [true, false], notes: ['', ''] }),
        completed: false,
        created_at: '2024-01-02T09:00:00Z',
        updated_at: '2024-01-02T09:00:00Z',
      },
    } as never)
  })

  it('打卡后显示每日检查项', async () => {
    renderSection()

    expect(await screen.findByText('每日上班检查')).toBeInTheDocument()
    expect(screen.getByText('确认今日优先级')).toBeInTheDocument()
    expect(screen.getByText('检查紧急工单')).toBeInTheDocument()
  })

  it('勾选后保存当前日期的进度', async () => {
    renderSection()

    const checkbox = await screen.findByRole('checkbox', { name: '确认今日优先级' })
    fireEvent.click(checkbox)
    fireEvent.click(screen.getByRole('button', { name: '保存进度' }))

    await waitFor(() => {
      expect(checklistReminders.save).toHaveBeenCalledWith({
        checklist_id: 1,
        kind: 'daily_start',
        occurrence_key: '2024-01-02',
        checked: [true, false],
        notes: ['', ''],
      })
    })
  })

  it('未打卡时不请求提醒', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <ChecklistReminderSection date="2024-01-02" enabled={false} />
        </ToastProvider>
      </QueryClientProvider>,
    )

    expect(checklistReminders.list).not.toHaveBeenCalled()
  })
})
