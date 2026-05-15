const API_BASE = ''

// ─── API 错误类型 ───────────────────────────────────────────────

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

// ─── Token 管理 ─────────────────────────────────────────────────

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

// ─── 通用请求函数 ───────────────────────────────────────────────

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
  
  const newToken = res.headers.get('X-New-Token')
  if (newToken) {
    setToken(newToken)
  }

  if (res.status === 401) {
    throw new ApiError('Unauthorized', 401)
  }

  const text = await res.text()
  let data: Record<string, unknown> = {}
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = { error: 'Invalid response format' }
    }
  }

  if (!res.ok) {
    throw new ApiError((data.error as string) || 'Request failed', res.status)
  }
  return data as T
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

// ─── 数据模型 ───────────────────────────────────────────────────

export interface Attendance {
  id: number
  user_id: number
  date: string
  clock_in: string | null
  clock_out: string | null
  status: string
  is_overtime: boolean
  created_at: string
  updated_at: string
}

export interface WorkLog {
  id: number
  user_id: number
  date: string
  content: string
  created_at: string
  updated_at: string
}

export interface AttendanceStats {
  global_overtime_days: number
  global_leave_days: number
  global_remaining: number
}

// ─── Attendance API ─────────────────────────────────────────────

export const attendance = {
  clockIn: (isOvertime?: boolean) => request<{ attendance: Attendance }>('/api/attendance/clock-in', {
    method: 'POST',
    body: JSON.stringify({ is_overtime: !!isOvertime }),
  }),
  setOvertime: (date: string, is_overtime: boolean) => request<{ attendance: Attendance }>('/api/attendance/overtime', {
    method: 'POST',
    body: JSON.stringify({ date, is_overtime }),
  }),
  clockOut: () => request<{ attendance: Attendance }>('/api/attendance/clock-out', { method: 'POST' }),
  leave: () => request<{ attendance: Attendance }>('/api/attendance/leave', { method: 'POST' }),
  today: () => request<{ attendance: Attendance | null }>('/api/attendance/today'),
  range: (start: string, end: string) =>
    request<{ attendances: Attendance[] }>(`/api/attendance/range?start=${start}&end=${end}`),
  stats: () => request<AttendanceStats>('/api/attendance/stats'),
}

// ─── Work Logs API ──────────────────────────────────────────────

export const workLogs = {
  save: (date: string, content: string) =>
    request<{ work_log: WorkLog }>('/api/work-logs', {
      method: 'POST',
      body: JSON.stringify({ date, content }),
    }),
  today: () => request<{ work_log: WorkLog | null }>('/api/work-logs/today'),
  range: (start: string, end: string) =>
    request<{ work_logs: WorkLog[] }>(`/api/work-logs/range?start=${start}&end=${end}`),
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
export interface ChecklistItem {
  text: string
  note?: string
}
export interface Checklist {
  id: number
  user_id: number
  title: string
  items: string // JSON array of ChecklistItem (legacy: strings)
  created_at: string
  updated_at: string
}

export interface ChecklistSnapshot {
  id: number
  user_id: number
  checklist_id: number
  title: string
  items_hash: string
  data: string // JSON: { checked: bool[], notes: string[], extras: [...] }
  created_at: string
}

export const checklists = {
  list: () =>
    request<{ checklists: Checklist[] }>('/api/checklists'),
  create: (title: string, items: ChecklistItem[]) =>
    request<{ checklist: Checklist }>('/api/checklists', {
      method: 'POST',
      body: JSON.stringify({ title, items }),
    }),
  update: (id: number, data: { title?: string; items?: ChecklistItem[] }) =>
    request<{ checklist: Checklist }>(`/api/checklists?id=${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: number) =>
    request<{ message: string }>(`/api/checklists?id=${id}`, { method: 'DELETE' }),
}

export interface SnapshotData {
  checked?: boolean[]
  notes?: string[]
  extras?: { id?: string; text: string; checked?: boolean; note?: string }[]
}

export const checklistSnapshots = {
  list: (checklistId: number) =>
    request<{ snapshots: ChecklistSnapshot[] }>(`/api/checklist-snapshots?checklist_id=${checklistId}`),
  create: (checklistId: number, title: string, itemsHash: string, data: SnapshotData) =>
    request<{ snapshot: ChecklistSnapshot }>('/api/checklist-snapshots', {
      method: 'POST',
      body: JSON.stringify({ checklist_id: checklistId, title, items_hash: itemsHash, data }),
    }),
  delete: (id: number) =>
    request<{ message: string }>(`/api/checklist-snapshots?id=${id}`, { method: 'DELETE' }),
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

// Iteration Overrides
export interface IterationOverride {
  id: number
  user_id: number
  iteration_number: number
  start_date: string
  end_date: string
  created_at: string
  updated_at: string
}

export const iterationOverrides = {
  list: () =>
    request<{ overrides: IterationOverride[] }>('/api/iteration-overrides'),
  save: (iteration_number: number, start_date: string, end_date: string) =>
    request<{ override: IterationOverride }>('/api/iteration-overrides', {
      method: 'POST',
      body: JSON.stringify({ iteration_number, start_date, end_date }),
    }),
  delete: (iteration_number: number) =>
    request<{ message: string }>(`/api/iteration-overrides?iteration_number=${iteration_number}`, {
      method: 'DELETE',
    }),
}

// System
export const system = {
  version: () => request<{ commit: string; date: string; content: string }>('/api/system/version'),
}

// History
export const history = {
  dateRange: () =>
    request<{ earliest: string | null; latest: string | null }>('/api/history/date-range'),
}

// Settings
export const settings = {
  get: () => request<{ timezone: string; kanban_url: string; theme: string; iteration_start_date: string; iteration_duration_days: string }>('/api/settings'),
  save: (data: { timezone?: string; kanban_url?: string; theme?: string; iteration_start_date?: string; iteration_duration_days?: string }) =>
    request<{ timezone: string; kanban_url: string; theme: string; iteration_start_date: string; iteration_duration_days: string }>('/api/settings', {
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
    request<{ message: string; attendance_count: number; work_log_count: number; todo_count: number }>('/api/data/delete', {
      method: 'DELETE',
      body: JSON.stringify({ password }),
    }),
  importData: async (file: File): Promise<{ message: string; attendance_count: number; work_log_count: number }> => {
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
