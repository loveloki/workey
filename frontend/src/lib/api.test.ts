import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setToken, clearToken, isLoggedIn, base64urlToBuffer } from './api'

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
      '/api/auth/me',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer my-jwt',
        }),
      }),
    )
  })

  it('401 响应抛出 Unauthorized 错误', async () => {
    await checkRequest({
      mockResponse: { status: 401 },
      token: 'expired-token',
      expectError: { message: 'Unauthorized' },
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
    await expect(auth.me()).rejects.toThrow('Invalid response format')
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
