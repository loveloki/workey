import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReminderSection } from './ReminderSection'
import { ToastProvider } from '../../lib/toast-context'

vi.mock('../../lib/api', async importOriginal => {
  const actual = await importOriginal<typeof import('../../lib/api')>()
  return {
    ...actual,
    settings: {
      get: vi.fn(),
      save: vi.fn(),
    },
  }
})

import { settings } from '../../lib/api'

const defaultSettings = {
  timezone: '+8',
  kanban_url: 'https://www.fizzy.do/',
  theme: 'light',
  iteration_start_date: '2019-09-02',
  iteration_duration_days: '14',
  reminder_delay: '9',
}

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

function Wrapper({ client }: { client: QueryClient }) {
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ReminderSection />
      </ToastProvider>
    </QueryClientProvider>
  )
}

describe('ReminderSection', () => {
  let client: QueryClient

  beforeEach(() => {
    client = makeClient()
    vi.mocked(settings.get).mockResolvedValue(defaultSettings as any)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('渲染延迟选择器', async () => {
    render(<Wrapper client={client} />)
    await waitFor(() => {
      expect(screen.getByText(/上班时长/)).toBeInTheDocument()
    })
  })

  it('默认选中 9 小时', async () => {
    render(<Wrapper client={client} />)
    await waitFor(() => {
      const select = screen.getByRole('combobox') as HTMLSelectElement
      expect(select.value).toBe('9')
    })
  })

  it('保存延迟设置', async () => {
    vi.mocked(settings.save).mockResolvedValue({
      ...defaultSettings,
      reminder_delay: '7',
    } as any)

    render(<Wrapper client={client} />)

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '7' } })

    await act(async () => {
      fireEvent.click(screen.getByText('保存'))
    })

    await waitFor(() => {
      expect(settings.save).toHaveBeenCalledWith({ reminder_delay: '7' })
    })
  })

  it('不再显示推送订阅入口', async () => {
    render(<Wrapper client={client} />)
    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument()
    })
    expect(screen.queryByText(/推送/)).not.toBeInTheDocument()
  })
})
