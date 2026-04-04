const API_BASE = ''

function getToken(): string | null {
  return localStorage.getItem('token')
}

export function setToken(token: string) {
  localStorage.setItem('token', token)
}

export function clearToken() {
  localStorage.removeItem('token')
}

export function isLoggedIn(): boolean {
  return !!getToken()
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error || 'Request failed')
  }
  return data
}

// Auth
export const auth = {
  register: (username: string, password: string) =>
    request<{ token: string; user: { id: number; username: string } }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  login: (username: string, password: string) =>
    request<{ token: string; user: { id: number; username: string } }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  me: () => request<{ user: { id: number; username: string } }>('/api/auth/me'),
}

// Attendance
export const attendance = {
  clockIn: () => request<any>('/api/attendance/clock-in', { method: 'POST' }),
  clockOut: () => request<any>('/api/attendance/clock-out', { method: 'POST' }),
  today: () => request<{ attendance: any }>('/api/attendance/today'),
  range: (start: string, end: string) =>
    request<{ attendances: any[] }>(`/api/attendance/range?start=${start}&end=${end}`),
}

// Work Logs
export const workLogs = {
  save: (date: string, content: string) =>
    request<{ work_log: any }>('/api/work-logs', {
      method: 'POST',
      body: JSON.stringify({ date, content }),
    }),
  today: () => request<{ work_log: any }>('/api/work-logs/today'),
  range: (start: string, end: string) =>
    request<{ work_logs: any[] }>(`/api/work-logs/range?start=${start}&end=${end}`),
}

// Lessons
export const lessons = {
  save: (date: string, content: string) =>
    request<{ lesson: any }>('/api/lessons', {
      method: 'POST',
      body: JSON.stringify({ date, content }),
    }),
  today: () => request<{ lesson: any }>('/api/lessons/today'),
  range: (start: string, end: string) =>
    request<{ lessons: any[] }>(`/api/lessons/range?start=${start}&end=${end}`),
}

// Upload
export async function uploadImage(file: File): Promise<{ url: string; filename: string; markdown: string }> {
  const token = getToken()
  const form = new FormData()
  form.append('file', file)
  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Upload failed')
  return data
}

// Todos
export const todos = {
  list: (all = false) =>
    request<{ todos: Todo[] }>(`/api/todos${all ? '?all=1' : ''}`),
  createdToday: () =>
    request<{ todos: Todo[] }>('/api/todos/created-today'),
  completedToday: () =>
    request<{ todos: Todo[] }>('/api/todos/completed-today'),
  completedRange: (start: string, end: string) =>
    request<{ todos: Todo[] }>(`/api/todos/completed-range?start=${start}&end=${end}`),
  create: (content: string, url: string) =>
    request<{ todo: Todo }>('/api/todos', {
      method: 'POST',
      body: JSON.stringify({ content, url }),
    }),
  update: (id: number, data: { content?: string; url?: string; done?: boolean }) =>
    request<{ todo: Todo }>(`/api/todos?id=${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: number) =>
    request<{ message: string }>(`/api/todos?id=${id}`, { method: 'DELETE' }),
}

export interface Todo {
  id: number
  user_id: number
  content: string
  url: string
  done: boolean
  created_at: string
  updated_at: string
}

// Checklists
export interface Checklist {
  id: number
  user_id: number
  title: string
  items: string // JSON array of strings
  created_at: string
  updated_at: string
}

export const checklists = {
  list: () =>
    request<{ checklists: Checklist[] }>('/api/checklists'),
  create: (title: string, items: string[]) =>
    request<{ checklist: Checklist }>('/api/checklists', {
      method: 'POST',
      body: JSON.stringify({ title, items }),
    }),
  update: (id: number, data: { title?: string; items?: string[] }) =>
    request<{ checklist: Checklist }>(`/api/checklists?id=${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: number) =>
    request<{ message: string }>(`/api/checklists?id=${id}`, { method: 'DELETE' }),
}

// Passkeys
export const passkeys = {
  list: () =>
    request<{ passkeys: Passkey[] }>('/api/passkeys'),
  delete: (id: number) =>
    request<{ message: string }>(`/api/passkeys?id=${id}`, { method: 'DELETE' }),
  registerBegin: () =>
    request<PasskeyCreationOptions>('/api/passkeys/register/begin', { method: 'POST' }),
  registerFinish: (name: string, credential: PublicKeyCredential) =>
    request<{ passkey: Passkey }>('/api/passkeys/register/finish', {
      method: 'POST',
      body: JSON.stringify({
        name,
        id: bufferToBase64url((credential.rawId)),
        rawId: bufferToBase64url(credential.rawId),
        type: credential.type,
        response: {
          attestationObject: bufferToBase64url(
            (credential.response as AuthenticatorAttestationResponse).attestationObject
          ),
          clientDataJSON: bufferToBase64url(credential.response.clientDataJSON),
        },
      }),
    }),
  authBegin: () =>
    request<PasskeyRequestOptions>('/api/passkeys/auth/begin', {
      method: 'POST',
    }),
  authFinish: (challengeId: string, credential: PublicKeyCredential) => {
    const response = credential.response as AuthenticatorAssertionResponse
    return request<{ token: string; user: { id: number; username: string } }>('/api/passkeys/auth/finish', {
      method: 'POST',
      body: JSON.stringify({
        challengeId,
        id: bufferToBase64url(credential.rawId),
        rawId: bufferToBase64url(credential.rawId),
        type: credential.type,
        response: {
          authenticatorData: bufferToBase64url(response.authenticatorData),
          clientDataJSON: bufferToBase64url(response.clientDataJSON),
          signature: bufferToBase64url(response.signature),
          userHandle: response.userHandle ? bufferToBase64url(response.userHandle) : undefined,
        },
      }),
    })
  },
}

export interface Passkey {
  id: number
  name: string
  created_at: string
  last_used_at: string | null
}

export interface PasskeyCreationOptions {
  challenge: string
  rp: { name: string; id: string }
  user: { id: string; name: string; displayName: string }
  pubKeyCredParams: { type: string; alg: number }[]
  authenticatorSelection: {
    authenticatorAttachment?: string
    residentKey?: string
    userVerification?: string
  }
  timeout: number
  attestation: string
  excludeCredentials: { type: string; id: string }[]
}

export interface PasskeyRequestOptions {
  challenge: string
  challengeId: string
  rpId: string
  timeout: number
  userVerification: string
}

// Base64url helpers
function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let str = ''
  for (const b of bytes) str += String.fromCharCode(b)
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function base64urlToBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  const pad = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4))
  const binary = atob(base64 + pad)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

// History
export const history = {
  dateRange: () =>
    request<{ earliest: string | null; latest: string | null }>('/api/history/date-range'),
}

// Settings
export const settings = {
  get: () => request<{ timezone: string; kanban_url: string; theme: string }>('/api/settings'),
  save: (data: { timezone?: string; kanban_url?: string; theme?: string }) =>
    request<{ timezone: string; kanban_url: string; theme: string }>('/api/settings', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  changePassword: (old_password: string, new_password: string) =>
    request<{ message: string }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ old_password, new_password }),
    }),
  exportData: async (): Promise<Blob> => {
    const token = getToken()
    const res = await fetch('/api/data/export', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || 'Export failed')
    }
    return res.blob()
  },
  deleteData: (password: string) =>
    request<{ message: string; attendance_count: number; work_log_count: number; lesson_count: number; todo_count: number }>('/api/data/delete', {
      method: 'DELETE',
      body: JSON.stringify({ password }),
    }),
  importData: async (file: File): Promise<{ message: string; attendance_count: number; work_log_count: number; image_count: number }> => {
    const token = getToken()
    const form = new FormData()
    form.append('file', file)
    const res = await fetch('/api/data/import', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Import failed')
    return data
  },
}
