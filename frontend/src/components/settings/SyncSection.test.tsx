/**
 * SyncSection 组件测试
 *
 * 测试范围：渲染表单、保存配置、测试连接、push/pull 调用、冲突弹窗与 force 操作
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SyncSection } from './SyncSection'
import { ToastProvider } from '../../lib/toast-context'

// 模拟 sync API
vi.mock('../../lib/api', async importOriginal => {
  const actual = await importOriginal<typeof import('../../lib/api')>()
  return {
    ...actual,
    sync: {
      getConfig: vi.fn(),
      saveConfig: vi.fn(),
      deleteConfig: vi.fn(),
      validate: vi.fn(),
      getStatus: vi.fn(),
      getLogs: vi.fn(),
      push: vi.fn(),
      pull: vi.fn(),
      check: vi.fn(),
    },
  }
})

import { sync } from '../../lib/api'

// 默认模拟返回：未配置状态
const defaultConfig = { configured: false, webdav_url: '', webdav_username: '', remote_path: '', created_at: '', updated_at: '' }
const defaultStatus = { configured: false, last_sync_at: null, last_direction: null, last_local_hash: null, last_remote_hash: null }
const defaultLogs = { logs: [] }

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
        <SyncSection />
      </ToastProvider>
    </QueryClientProvider>
  )
}

describe('SyncSection', () => {
  let client: QueryClient

  beforeEach(() => {
    client = makeClient()
    // 未配置状态默认模拟
    vi.mocked(sync.getConfig).mockResolvedValue(defaultConfig as any)
    vi.mocked(sync.getStatus).mockResolvedValue(defaultStatus as any)
    vi.mocked(sync.getLogs).mockResolvedValue(defaultLogs as any)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ─── 渲染测试 ──────────────────────────────

  it('渲染 WebDAV 配置表单字段', async () => {
    render(<Wrapper client={client} />)
    expect(screen.getByTestId('sync-url')).toBeInTheDocument()
    expect(screen.getByTestId('sync-username')).toBeInTheDocument()
    expect(screen.getByTestId('sync-password')).toBeInTheDocument()
    expect(screen.getByTestId('sync-remote-path')).toBeInTheDocument()
  })

  it('渲染保存配置和测试连接按钮', async () => {
    render(<Wrapper client={client} />)
    expect(screen.getByTestId('sync-save-btn')).toBeInTheDocument()
    expect(screen.getByTestId('sync-validate-btn')).toBeInTheDocument()
  })

  it('未配置时不显示同步操作按钮', async () => {
    render(<Wrapper client={client} />)
    await waitFor(() => {
      expect(screen.queryByTestId('sync-push-btn')).not.toBeInTheDocument()
      expect(screen.queryByTestId('sync-pull-btn')).not.toBeInTheDocument()
    })
  })

  it('配置已存在时显示同步操作按钮', async () => {
    vi.mocked(sync.getConfig).mockResolvedValue({
      configured: true, webdav_url: 'https://dav.example.com', webdav_username: 'user',
      remote_path: '/workey', created_at: '2024-01-01', updated_at: '2024-01-01',
    } as any)
    render(<Wrapper client={client} />)
    await waitFor(() => {
      expect(screen.getByTestId('sync-push-btn')).toBeInTheDocument()
      expect(screen.getByTestId('sync-pull-btn')).toBeInTheDocument()
    })
  })

  // ─── 保存配置 ──────────────────────────────

  it('填写表单并保存配置', async () => {
    vi.mocked(sync.saveConfig).mockResolvedValue({
      configured: true, webdav_url: 'https://dav.example.com', webdav_username: 'alice',
      remote_path: '/workey', created_at: '', updated_at: '',
    } as any)

    render(<Wrapper client={client} />)

    fireEvent.change(screen.getByTestId('sync-url'), { target: { value: 'https://dav.example.com' } })
    fireEvent.change(screen.getByTestId('sync-username'), { target: { value: 'alice' } })
    fireEvent.change(screen.getByTestId('sync-password'), { target: { value: 'secret' } })
    fireEvent.change(screen.getByTestId('sync-remote-path'), { target: { value: '/workey' } })

    await act(async () => {
      fireEvent.click(screen.getByTestId('sync-save-btn'))
    })

    await waitFor(() => {
      expect(sync.saveConfig).toHaveBeenCalledWith({
        webdav_url: 'https://dav.example.com',
        webdav_username: 'alice',
        webdav_password: 'secret',
        remote_path: '/workey',
      })
    })
  })

  it('保存时字段为空则不调用 API', async () => {
    render(<Wrapper client={client} />)
    await act(async () => {
      fireEvent.click(screen.getByTestId('sync-save-btn'))
    })
    expect(sync.saveConfig).not.toHaveBeenCalled()
  })

  // ─── 测试连接 ──────────────────────────────

  it('validate 成功时调用 API', async () => {
    vi.mocked(sync.validate).mockResolvedValue({ success: true, message: '连接成功' } as any)

    render(<Wrapper client={client} />)
    fireEvent.change(screen.getByTestId('sync-url'), { target: { value: 'https://dav.example.com' } })
    fireEvent.change(screen.getByTestId('sync-username'), { target: { value: 'alice' } })
    fireEvent.change(screen.getByTestId('sync-password'), { target: { value: 'secret' } })
    fireEvent.change(screen.getByTestId('sync-remote-path'), { target: { value: '/workey' } })

    await act(async () => {
      fireEvent.click(screen.getByTestId('sync-validate-btn'))
    })

    await waitFor(() => {
      expect(sync.validate).toHaveBeenCalledWith({
        webdav_url: 'https://dav.example.com',
        webdav_username: 'alice',
        webdav_password: 'secret',
        remote_path: '/workey',
      })
    })
  })

  it('validate 失败时调用 API 并不报崩', async () => {
    vi.mocked(sync.validate).mockResolvedValue({ success: false, message: '认证失败' } as any)

    render(<Wrapper client={client} />)
    fireEvent.change(screen.getByTestId('sync-url'), { target: { value: 'https://dav.example.com' } })
    fireEvent.change(screen.getByTestId('sync-username'), { target: { value: 'alice' } })
    fireEvent.change(screen.getByTestId('sync-password'), { target: { value: 'wrong' } })
    fireEvent.change(screen.getByTestId('sync-remote-path'), { target: { value: '/workey' } })

    await act(async () => {
      fireEvent.click(screen.getByTestId('sync-validate-btn'))
    })

    await waitFor(() => {
      expect(sync.validate).toHaveBeenCalled()
    })
  })

  // ─── Push / Pull ────────────────────────────

  it('点击推送按钮调用 push API（force=false）', async () => {
    vi.mocked(sync.getConfig).mockResolvedValue({
      configured: true, webdav_url: 'https://dav.example.com', webdav_username: 'user',
      remote_path: '/workey', created_at: '', updated_at: '',
    } as any)
    vi.mocked(sync.push).mockResolvedValue({ message: '推送成功', local_hash: 'abc', remote_hash: 'abc' } as any)

    render(<Wrapper client={client} />)
    await waitFor(() => {
      expect(screen.getByTestId('sync-push-btn')).toBeInTheDocument()
    })

    await act(async () => {
      fireEvent.click(screen.getByTestId('sync-push-btn'))
    })

    await waitFor(() => {
      expect(sync.push).toHaveBeenCalledWith(false)
    })
  })

  it('点击拉取按钮调用 pull API（force=false）', async () => {
    vi.mocked(sync.getConfig).mockResolvedValue({
      configured: true, webdav_url: 'https://dav.example.com', webdav_username: 'user',
      remote_path: '/workey', created_at: '', updated_at: '',
    } as any)
    vi.mocked(sync.pull).mockResolvedValue({ message: '拉取成功', local_hash: 'abc', remote_hash: 'abc' } as any)

    render(<Wrapper client={client} />)
    await waitFor(() => {
      expect(screen.getByTestId('sync-pull-btn')).toBeInTheDocument()
    })

    await act(async () => {
      fireEvent.click(screen.getByTestId('sync-pull-btn'))
    })

    await waitFor(() => {
      expect(sync.pull).toHaveBeenCalledWith(false)
    })
  })

  // ─── 冲突弹窗 ─────────────────────────────

  it('push 返回 409 时弹出冲突弹窗', async () => {
    vi.mocked(sync.getConfig).mockResolvedValue({
      configured: true, webdav_url: 'https://dav.example.com', webdav_username: 'user',
      remote_path: '/workey', created_at: '', updated_at: '',
    } as any)
    const conflictErr = Object.assign(new Error('Conflict'), { status: 409 })
    vi.mocked(sync.push).mockRejectedValue(conflictErr)

    render(<Wrapper client={client} />)
    await waitFor(() => {
      expect(screen.getByTestId('sync-push-btn')).toBeInTheDocument()
    })

    await act(async () => {
      fireEvent.click(screen.getByTestId('sync-push-btn'))
    })

    await waitFor(() => {
      expect(screen.getByText(/检测到同步冲突/)).toBeInTheDocument()
    })
  })

  it('冲突弹窗中选择本地调用 force push', async () => {
    vi.mocked(sync.getConfig).mockResolvedValue({
      configured: true, webdav_url: 'https://dav.example.com', webdav_username: 'user',
      remote_path: '/workey', created_at: '', updated_at: '',
    } as any)
    const conflictErr = Object.assign(new Error('Conflict'), { status: 409 })
    vi.mocked(sync.push)
      .mockRejectedValueOnce(conflictErr)
      .mockResolvedValue({ message: 'force push ok', local_hash: 'x', remote_hash: 'x' } as any)

    render(<Wrapper client={client} />)
    await waitFor(() => {
      expect(screen.getByTestId('sync-push-btn')).toBeInTheDocument()
    })

    await act(async () => {
      fireEvent.click(screen.getByTestId('sync-push-btn'))
    })

    await waitFor(() => {
      expect(screen.getByText(/检测到同步冲突/)).toBeInTheDocument()
    })

    const localBtn = screen.getByText(/使用本地覆盖远端/)
    await act(async () => {
      fireEvent.click(localBtn)
    })

    await waitFor(() => {
      expect(sync.push).toHaveBeenCalledWith(true)
    })
  })

  it('冲突弹窗中选择远端调用 force pull', async () => {
    vi.mocked(sync.getConfig).mockResolvedValue({
      configured: true, webdav_url: 'https://dav.example.com', webdav_username: 'user',
      remote_path: '/workey', created_at: '', updated_at: '',
    } as any)
    const conflictErr = Object.assign(new Error('Conflict'), { status: 409 })
    vi.mocked(sync.push).mockRejectedValue(conflictErr)
    vi.mocked(sync.pull).mockResolvedValue({ message: 'force pull ok', local_hash: 'x', remote_hash: 'x' } as any)

    render(<Wrapper client={client} />)
    await waitFor(() => {
      expect(screen.getByTestId('sync-push-btn')).toBeInTheDocument()
    })

    await act(async () => {
      fireEvent.click(screen.getByTestId('sync-push-btn'))
    })

    await waitFor(() => {
      expect(screen.getByText(/检测到同步冲突/)).toBeInTheDocument()
    })

    const remoteBtn = screen.getByText(/使用远端覆盖本地/)
    await act(async () => {
      fireEvent.click(remoteBtn)
    })

    await waitFor(() => {
      expect(sync.pull).toHaveBeenCalledWith(true)
    })
  })

  it('冲突弹窗可以取消', async () => {
    vi.mocked(sync.getConfig).mockResolvedValue({
      configured: true, webdav_url: 'https://dav.example.com', webdav_username: 'user',
      remote_path: '/workey', created_at: '', updated_at: '',
    } as any)
    const conflictErr = Object.assign(new Error('Conflict'), { status: 409 })
    vi.mocked(sync.push).mockRejectedValue(conflictErr)

    render(<Wrapper client={client} />)
    await waitFor(() => {
      expect(screen.getByTestId('sync-push-btn')).toBeInTheDocument()
    })

    await act(async () => {
      fireEvent.click(screen.getByTestId('sync-push-btn'))
    })

    await waitFor(() => {
      expect(screen.getByText(/检测到同步冲突/)).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('取消'))
    await waitFor(() => {
      expect(screen.queryByText(/检测到同步冲突/)).not.toBeInTheDocument()
    })
  })
})
