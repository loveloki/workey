import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { apiUrl, auth, ApiError, setToken, clearToken, isLoggedIn, settings, ticketIssues } from './api'
import { setModuleLanguage, t } from './i18n'

beforeEach(() => {
  vi.stubEnv('VITE_API_BASE_URL', undefined)
  setModuleLanguage('zh-CN')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  setModuleLanguage('zh-CN')
})

// ─── Token 管理 ─────────────────────────────────────────────────
// 测试 Feature：用户认证凭证的本地持久化
describe('token management', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('初始状态未登录', () => {
    expect(isLoggedIn()).toBe(false)
  })

  it('设置 token 后处于登录状态', () => {
    setToken('test-jwt-token')
    expect(isLoggedIn()).toBe(true)
    expect(localStorage.getItem('token')).toBe('test-jwt-token')
  })

  it('清除 token 后退出登录', () => {
    setToken('abc')
    clearToken()
    expect(isLoggedIn()).toBe(false)
    expect(localStorage.getItem('token')).toBeNull()
  })
})

// ─── request 函数行为 ───────────────────────────────────────────
// 测试 Feature：HTTP 请求的核心行为（认证、错误处理）
describe('request behavior', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    localStorage.clear()
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  // check 函数：模拟 fetch 并验证 request 的行为
  async function checkRequest(opts: {
    mockResponse: { status: number; headers?: Record<string, string>; body?: any }
    token?: string
    expectError?: { message: string; status?: number }
  }) {
    if (opts.token) setToken(opts.token)

    const mockHeaders = new Headers(opts.mockResponse.headers || {})
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: opts.mockResponse.status,
      ok: opts.mockResponse.status >= 200 && opts.mockResponse.status < 300,
      headers: mockHeaders,
      text: () => Promise.resolve(
        opts.mockResponse.body !== undefined ? JSON.stringify(opts.mockResponse.body) : ''
      ),
    })

    // 需要动态 import 因为 request 是私有函数，通过 auth.me 间接测试
    const { auth } = await import('./api')

    if (opts.expectError) {
      await expect(auth.me()).rejects.toThrow(opts.expectError.message)
    } else {
      return auth.me()
    }
  }

  it('成功请求携带 Authorization header', async () => {
    setToken('my-jwt')
    const mockHeaders = new Headers()
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      headers: mockHeaders,
      text: () => Promise.resolve(JSON.stringify({ user: { id: 'a1', username: 'test' } })),
    })

    const { auth } = await import('./api')
    await auth.me()

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/workey/auth/me',
      expect.objectContaining({
        credentials: 'include',
        headers: expect.objectContaining({
          'Authorization': 'Bearer my-jwt',
        }),
      }),
    )
  })

  it('Workey 401 响应抛出本地化认证错误', async () => {
    await checkRequest({
      mockResponse: { status: 401 },
      token: 'expired-token',
      expectError: { message: t('api.unauthorized') },
    })
  })

  it('4xx/5xx 响应抛出服务端 message', async () => {
    await checkRequest({
      mockResponse: { status: 500, body: { status: 500, message: 'Internal server error', data: {} } },
      expectError: { message: 'Internal server error' },
    })
  })

  it('无效 JSON 响应返回错误信息', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 400,
      ok: false,
      headers: new Headers(),
      text: () => Promise.resolve('not json at all'),
    })

    const { auth } = await import('./api')
    await expect(auth.me()).rejects.toThrow(t('api.invalidResponse'))
  })
})

// ─── Ticket Issues API ──────────────────────────────────────────
describe('ticket issues API', () => {
  beforeEach(() => {
    localStorage.clear()
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      headers: new Headers(),
      text: () => Promise.resolve(JSON.stringify({ ticket_issues: [] })),
    })
  })

  it('列表查询正确编码筛选条件', async () => {
    await ticketIssues.list({
      start: '2025-01-01',
      end: '2025-01-31',
      cause_type: 'code',
      q: '登录 失败',
    })

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/workey/ticket-issues?start=2025-01-01&end=2025-01-31&cause_type=code&q=%E7%99%BB%E5%BD%95+%E5%A4%B1%E8%B4%A5',
      expect.any(Object),
    )
  })

  it('统计查询不携带原因分类', async () => {
    await ticketIssues.stats({ cause_type: 'operation', q: '配置' })

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/workey/ticket-issues/stats?q=%E9%85%8D%E7%BD%AE',
      expect.any(Object),
    )
  })

  it('创建记录发送完整请求体', async () => {
    const input = {
      ticket_no: 'WO-1',
      ticket_title: '标题',
      ticket_url: '',
      occurred_on: '2025-01-01',
      cause_type: 'code' as const,
      problem_description: '问题',
      cause_detail: '根因',
      resolution: '复盘',
    }
    await ticketIssues.create(input)

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/workey/ticket-issues',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(input) }),
    )
  })

  it('字符串 ID 原样作为查询参数', async () => {
    await ticketIssues.delete('k3j214gy3jqop7z')

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/workey/ticket-issues?id=k3j214gy3jqop7z',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })
})

describe('API URL configuration', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() =>
      Promise.resolve(new Response('{"user":{"id":"a1","username":"test"}}')),
    ))
  })

  it('未配置时使用同源 API', async () => {
    setToken('same-origin-token')
    await auth.me()

    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      '/api/workey/auth/me',
      expect.objectContaining({
        credentials: 'include',
        headers: expect.objectContaining({ Authorization: 'Bearer same-origin-token' }),
      }),
    )
  })

  it('显式配置后端地址时拼接前缀', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com/prefix/')
    await auth.me()

    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      'https://api.example.com/prefix/api/workey/auth/me',
      expect.objectContaining({ credentials: 'include' }),
    )
  })

  it.each([
    ['https://api.example.com/', '/api/workey/auth/me', 'https://api.example.com/api/workey/auth/me'],
    [' https://api.example.com/prefix/// ', 'api/workey/auth/me', 'https://api.example.com/prefix/api/workey/auth/me'],
    ['https://api.example.com/prefix/', '//api/workey/todos?all=1', 'https://api.example.com/prefix/api/workey/todos?all=1'],
    ['', 'api/workey/auth/me', '/api/workey/auth/me'],
  ])('路径拼接保留前缀和 query，规范化斜杠：%s + %s', (base, path, expected) => {
    vi.stubEnv('VITE_API_BASE_URL', base)
    expect(apiUrl(path)).toBe(expected)
  })
})

describe('proxy login and response errors', () => {
  beforeEach(() => {
    localStorage.clear()
    setToken('keep-token')
  })

  it.each([200, 401, 403])('HTML 登录页（%i）不是 Workey 认证失败', async status => {
    const response = new Response('<!doctype html><html>Sign in</html>', {
      status,
      headers: { 'Content-Type': 'text/html' },
    })
    Object.defineProperty(response, 'redirected', { value: true })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))

    const error = await auth.me().catch(error => error)

    expect(error).not.toBeInstanceOf(ApiError)
    expect(error.message).toBe(t('api.loginPage', { url: '/' }))
    expect(localStorage.getItem('token')).toBe('keep-token')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('没有 HTML Content-Type 也能识别登录页', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('<html><body>Sign in</body></html>', { headers: { 'Content-Type': 'text/plain' } }),
    ))

    await expect(auth.me()).rejects.toThrow(t('api.loginPage', { url: '/' }))
  })

  it('成功状态的非 JSON 数据也必须失败', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not JSON')))
    await expect(auth.me()).rejects.toThrow(t('api.invalidResponse'))
  })

  it('无效数据使用当前英文语言', async () => {
    setModuleLanguage('en-US')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not JSON')))
    await expect(auth.me()).rejects.toThrow('The API returned invalid data.')
  })

  it('网络故障给出本地化提示且保留 token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(auth.me()).rejects.toThrow(t('api.connectionFailed', { url: '/' }))
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('token')).toBe('keep-token')
  })

  it('英文网络错误也提示先确认后端可用', async () => {
    setModuleLanguage('en-US')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(auth.me()).rejects.toThrow('Open this address in your browser')
  })

  it('Workey JSON 错误保留状态码和响应数据', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('{"status":409,"message":"conflict","data":{"count":2}}', { status: 409 }),
    ))
    await expect(auth.me()).rejects.toMatchObject({
      status: 409, message: 'conflict', data: { status: 409, message: 'conflict', data: { count: 2 } },
    })
  })
})

describe('export and import requests', () => {
  beforeEach(() => {
    localStorage.clear()
    setToken('user-token')
  })

  it.each([undefined, '', 'https://api.example.com/prefix/'])('导出 ZIP 使用统一地址、认证与 cookie（base=%s）', async base => {
    vi.stubEnv('VITE_API_BASE_URL', base)
    const zip = new Blob(['PK\u0003\u0004zip-content'], { type: 'application/zip' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(zip, {
      headers: { 'Content-Type': 'application/zip' },
    })))

    const result = await settings.exportData()

    expect(await result.text()).toBe(await zip.text())
    expect(result.type).toBe('application/zip')
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      `${base ? 'https://api.example.com/prefix' : ''}/api/workey/data/export`,
      expect.objectContaining({
        credentials: 'include',
        headers: expect.objectContaining({ Authorization: 'Bearer user-token' }),
      }),
    )
  })

  it('导出也拒绝代理登录页', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('<!doctype html><html>Sign in</html>', { headers: { 'Content-Type': 'text/plain' } }),
    ))

    await expect(settings.exportData()).rejects.toThrow(t('api.loginPage', { url: '/' }))
    expect(localStorage.getItem('token')).toBe('user-token')
  })

  it('导出的 JSON 失败保留 Workey 错误', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() =>
      Promise.resolve(new Response('{"status":403,"message":"forbidden"}', { status: 403 })),
    ))

    await expect(settings.exportData()).rejects.toMatchObject({ status: 403, message: 'forbidden' })
  })
})

describe('auth API', () => {
  beforeEach(() => {
    localStorage.clear()
    setToken('user-token')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      token: 'new-token', user: { id: 'a1', username: 'test' },
    }))))
  })

  it('refresh 使用 POST 并返回新 token', async () => {
    const data = await auth.refresh()

    expect(data.token).toBe('new-token')
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      '/api/workey/auth/refresh',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    )
  })

  it('修改密码返回新 token', async () => {
    const data = await settings.changePassword('old-password', 'new-password')

    expect(data.token).toBe('new-token')
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      '/api/workey/auth/change-password',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ old_password: 'old-password', new_password: 'new-password' }),
      }),
    )
  })
})
