import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { apiUrl, auth, ApiError, setToken, clearToken, isLoggedIn, base64urlToBuffer, passkeys, push, settings, ticketIssues } from './api'
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
// 测试 Feature：HTTP 请求的核心行为（认证、错误处理、token 刷新）
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
      text: () => Promise.resolve(JSON.stringify({ user: { id: 1, username: 'test' } })),
    })

    const { auth } = await import('./api')
    await auth.me()

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://pockethost.exe.xyz/api/auth/me',
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

  it('4xx/5xx 响应抛出带 error 消息的错误', async () => {
    await checkRequest({
      mockResponse: { status: 500, body: { error: 'Internal server error' } },
      expectError: { message: 'Internal server error' },
    })
  })

  it('X-New-Token header 触发 token 刷新', async () => {
    const mockHeaders = new Headers({ 'X-New-Token': 'refreshed-token' })
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      headers: mockHeaders,
      text: () => Promise.resolve(JSON.stringify({ user: { id: 1, username: 'u' } })),
    })

    const { auth } = await import('./api')
    await auth.me()

    expect(localStorage.getItem('token')).toBe('refreshed-token')
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

// ─── Push Notifications API ─────────────────────────────────────
describe('push API', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    localStorage.clear()
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  function mockFetch(status: number, body: any) {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status,
      ok: status >= 200 && status < 300,
      headers: new Headers(),
      text: () => Promise.resolve(JSON.stringify(body)),
    })
  }

  it('getVapidKey 调用 GET /api/push/vapid-key', async () => {
    mockFetch(200, { public_key: 'test-public-key' })
    setToken('token')

    const result = await push.getVapidKey()

    expect(result.public_key).toBe('test-public-key')
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://pockethost.exe.xyz/api/push/vapid-key',
      expect.objectContaining({ credentials: 'include' }),
    )
  })

  it('subscribe 调用 POST /api/push/subscribe', async () => {
    mockFetch(200, { message: 'ok' })
    setToken('token')

    const result = await push.subscribe({
      endpoint: 'https://push.example.com',
      p256dh: 'abc',
      auth: 'def',
    })

    expect(result.message).toBe('ok')
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://pockethost.exe.xyz/api/push/subscribe',
      expect.objectContaining({
        credentials: 'include',
        method: 'POST',
        body: JSON.stringify({ endpoint: 'https://push.example.com', p256dh: 'abc', auth: 'def' }),
      }),
    )
  })

  it('unsubscribe 调用 DELETE /api/push/subscribe', async () => {
    mockFetch(200, { message: 'ok' })
    setToken('token')

    const result = await push.unsubscribe('https://push.example.com')

    expect(result.message).toBe('ok')
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://pockethost.exe.xyz/api/push/subscribe',
      expect.objectContaining({
        credentials: 'include',
        method: 'DELETE',
        body: JSON.stringify({ endpoint: 'https://push.example.com' }),
      }),
    )
  })

  it('unsubscribe 不带 endpoint 时删除所有订阅', async () => {
    mockFetch(200, { message: 'ok' })
    setToken('token')

    const result = await push.unsubscribe()

    expect(result.message).toBe('ok')
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://pockethost.exe.xyz/api/push/subscribe',
      expect.objectContaining({
        credentials: 'include',
        method: 'DELETE',
        body: '{}',
      }),
    )
  })
})

// ─── base64url 编解码 ───────────────────────────────────────────
// 测试 Feature：WebAuthn passkey 数据的序列化/反序列化
describe('base64url encoding', () => {
  function check(base64url: string, expectedBytes: number[]) {
    const buffer = base64urlToBuffer(base64url)
    const arr = Array.from(new Uint8Array(buffer))
    expect(arr).toEqual(expectedBytes)
  }

  it('空字符串', () => {
    check('', [])
  })

  it('标准 base64url 解码', () => {
    // 'AQID' = [1, 2, 3]
    check('AQID', [1, 2, 3])
  })

  it('处理 base64url 特殊字符（- 和 _）', () => {
    // '+/' in base64 => '-_' in base64url
    // '/+8=' in base64 => '-_8' in base64url (represents 0xFF 0xEF)
    check('_-8', [0xFF, 0xEF])
  })

  it('处理无 padding 的情况', () => {
    // 'YQ' should decode to 'a' (0x61)
    check('YQ', [0x61])
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
      'https://pockethost.exe.xyz/api/ticket-issues?start=2025-01-01&end=2025-01-31&cause_type=code&q=%E7%99%BB%E5%BD%95+%E5%A4%B1%E8%B4%A5',
      expect.any(Object),
    )
  })

  it('统计查询不携带原因分类', async () => {
    await ticketIssues.stats({ cause_type: 'operation', q: '配置' })

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://pockethost.exe.xyz/api/ticket-issues/stats?q=%E9%85%8D%E7%BD%AE',
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
      'https://pockethost.exe.xyz/api/ticket-issues',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(input) }),
    )
  })
})

describe('API URL configuration', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() =>
      Promise.resolve(new Response('{"user":{"id":1,"username":"test"}}')),
    ))
  })

  it('未配置时默认远程，旧 token 不发送到本地 legacy API', async () => {
    setToken('legacy-token')
    await auth.me()

    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      'https://pockethost.exe.xyz/api/auth/me',
      expect.objectContaining({
        credentials: 'include',
        headers: expect.objectContaining({ Authorization: 'Bearer legacy-token' }),
      }),
    )
  })

  it('显式空字符串使用同源 API', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '')
    await auth.me()

    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      '/api/auth/me',
      expect.objectContaining({ credentials: 'include' }),
    )
  })

  it.each([
    ['https://api.example.com/', '/api/auth/me', 'https://api.example.com/api/auth/me'],
    [' https://api.example.com/prefix/// ', 'api/auth/me', 'https://api.example.com/prefix/api/auth/me'],
    ['https://api.example.com/prefix/', '//api/todos?all=1', 'https://api.example.com/prefix/api/todos?all=1'],
    ['', 'api/auth/me', '/api/auth/me'],
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

  it.each([200, 401, 403])('HTML 登录页（%i）不是 Workey 认证失败且不能刷新 token', async status => {
    const response = new Response('<!doctype html><html>Sign in</html>', {
      status,
      headers: { 'Content-Type': 'text/html', 'X-New-Token': 'proxy-token' },
    })
    Object.defineProperty(response, 'redirected', { value: true })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))

    const error = await auth.me().catch(error => error)

    expect(error).not.toBeInstanceOf(ApiError)
    expect(error.message).toBe(t('api.loginPage', { url: 'https://pockethost.exe.xyz/' }))
    expect(localStorage.getItem('token')).toBe('keep-token')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('没有 HTML Content-Type 也能识别登录页', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('<html><body>Sign in</body></html>', { headers: { 'Content-Type': 'text/plain' } }),
    ))

    await expect(auth.me()).rejects.toThrow(t('api.loginPage', { url: 'https://pockethost.exe.xyz/' }))
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

  it('网络/CORS 故障给出本地化提示且不回退本地 API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(auth.me()).rejects.toThrow(t('api.connectionFailed', { url: 'https://pockethost.exe.xyz/' }))
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('token')).toBe('keep-token')
  })

  it('英文网络错误也提示先在浏览器访问远端代理登录', async () => {
    setModuleLanguage('en-US')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(auth.me()).rejects.toThrow('Open this address in your browser and sign in to the exe.dev proxy')
  })

  it('Workey JSON 错误保留状态码和响应数据', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":"conflict","count":2}', { status: 409 })))
    await expect(auth.me()).rejects.toMatchObject({
      status: 409, message: 'conflict', data: { error: 'conflict', count: 2 },
    })
  })
})

describe('export, import and passkey requests', () => {
  beforeEach(() => {
    localStorage.clear()
    setToken('user-token')
  })

  it.each([undefined, ''])('导出 ZIP 使用统一地址、认证与 cookie（base=%s）', async base => {
    vi.stubEnv('VITE_API_BASE_URL', base)
    const zip = new Blob(['PK\u0003\u0004zip-content'], { type: 'application/zip' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(zip, {
      headers: { 'Content-Type': 'application/zip', 'X-New-Token': 'refreshed-token' },
    })))

    const result = await settings.exportData()

    expect(await result.text()).toBe(await zip.text())
    expect(result.type).toBe('application/zip')
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      `${base === '' ? '' : 'https://pockethost.exe.xyz'}/api/data/export`,
      expect.objectContaining({
        credentials: 'include',
        headers: expect.objectContaining({ Authorization: 'Bearer user-token' }),
      }),
    )
    expect(localStorage.getItem('token')).toBe('refreshed-token')
  })

  it('导入使用统一地址，不设置 multipart Content-Type 边界', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com/prefix/')
    const file = new File(['zip-content'], 'workey.zip', { type: 'application/zip' })
    const response = { message: 'ok', counts: {} }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(response))))

    await expect(settings.importData(file)).resolves.toEqual(response)
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      'https://api.example.com/prefix/api/data/import',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: expect.objectContaining({ Authorization: 'Bearer user-token' }),
        body: expect.any(FormData),
      }),
    )
    const [, options] = vi.mocked(fetch).mock.calls[0]
    expect(new Headers(options?.headers).has('Content-Type')).toBe(false)
    expect((options?.body as FormData).get('file')).toBe(file)
  })

  it.each(['export', 'import'] as const)('%s 也拒绝代理登录页', async operation => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('<!doctype html><html>Sign in</html>', { headers: { 'Content-Type': 'text/plain' } }),
    ))
    const result = operation === 'export'
      ? settings.exportData()
      : settings.importData(new File(['zip'], 'workey.zip'))

    await expect(result).rejects.toThrow(t('api.loginPage', { url: 'https://pockethost.exe.xyz/' }))
    expect(localStorage.getItem('token')).toBe('user-token')
  })

  it('导出和导入的 JSON 失败保留 Workey 错误', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() =>
      Promise.resolve(new Response('{"error":"forbidden"}', { status: 403 })),
    ))

    await expect(settings.exportData()).rejects.toMatchObject({ status: 403, message: 'forbidden' })
    await expect(settings.importData(new File(['zip'], 'workey.zip'))).rejects.toMatchObject({ status: 403, message: 'forbidden' })
  })

  it.each([
    ['registerBegin', '/api/passkeys/register/begin', { rp: { id: window.location.hostname, name: 'Workey' } }],
    ['authBegin', '/api/passkeys/auth/begin', { rpId: window.location.hostname }],
  ] as const)('Passkey %s 使用远程 API，保留按页面 Origin 返回的 RP', async (method, path, options) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(options))))

    await expect(passkeys[method]()).resolves.toEqual(options)
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      `https://pockethost.exe.xyz${path}`,
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    )
    const headers = new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers)
    expect(headers.has('Origin')).toBe(false)
  })
})
