import type {
  Attendance, WorkLog, Todo, Checklist, ChecklistSnapshot,
  IterationOverride, Passkey,
  AttendanceResponse, AttendanceListResponse, AttendanceStatsResponse,
  WorkLogResponse, WorkLogListResponse,
  TodoResponse, TodoListResponse,
  ChecklistResponse, ChecklistListResponse,
  SnapshotResponse, SnapshotListResponse,
  IterationOverrideResponse, IterationOverrideListResponse,
  SettingsResponse, VersionResponse, VersionRangeResponse,
  MessageResponse, AuthResponse, MeResponse,
  PasskeyListResponse, DataDeleteResponse,
  SyncConfigResponse, SyncStatusResponse, SyncCheckResponse,
  SyncOperationResponse, SyncValidateResponse, SyncLogListResponse,
} from './models.gen'

export type {
  Attendance, WorkLog, Todo, Checklist, ChecklistSnapshot,
  IterationOverride, Passkey, AttendanceStatsResponse as AttendanceStats,
} from './models.gen'

const API_BASE = ''

// ─── API 错误类型 ───────────────────────────────────────────────

export class ApiError extends Error {
  status: number
  data?: Record<string, unknown>
  constructor(message: string, status: number, data?: Record<string, unknown>) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
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
    throw new ApiError((data.error as string) || 'Request failed', res.status, data)
  }
  return data as T
}

// ─── Auth ───────────────────────────────────────────────────────

export const auth = {
  register: (username: string, password: string) =>
    request<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  login: (username: string, password: string) =>
    request<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  me: () => request<MeResponse>('/api/auth/me'),
}

// ─── Attendance ─────────────────────────────────────────────────

export const attendance = {
  clockIn: (isOvertime?: boolean) => request<AttendanceResponse>('/api/attendance/clock-in', {
    method: 'POST',
    body: JSON.stringify({ is_overtime: !!isOvertime }),
  }),
  setOvertime: (date: string, is_overtime: boolean) => request<AttendanceResponse>('/api/attendance/overtime', {
    method: 'POST',
    body: JSON.stringify({ date, is_overtime }),
  }),
  clockOut: () => request<AttendanceResponse>('/api/attendance/clock-out', { method: 'POST' }),
  leave: () => request<AttendanceResponse>('/api/attendance/leave', { method: 'POST' }),
  today: () => request<AttendanceResponse>('/api/attendance/today'),
  range: (start: string, end: string) =>
    request<AttendanceListResponse>(`/api/attendance/range?start=${start}&end=${end}`),
  stats: () => request<AttendanceStatsResponse>('/api/attendance/stats'),
}

// ─── Work Logs ──────────────────────────────────────────────────

export const workLogs = {
  save: (date: string, content: string) =>
    request<WorkLogResponse>('/api/work-logs', {
      method: 'POST',
      body: JSON.stringify({ date, content }),
    }),
  today: () => request<WorkLogResponse>('/api/work-logs/today'),
  range: (start: string, end: string) =>
    request<WorkLogListResponse>(`/api/work-logs/range?start=${start}&end=${end}`),
}

// ─── Todos ──────────────────────────────────────────────────────

export const todos = {
  list: (all = false) =>
    request<TodoListResponse>(`/api/todos${all ? '?all=1' : ''}`),
  createdToday: () =>
    request<TodoListResponse>('/api/todos/created-today'),
  completedToday: () =>
    request<TodoListResponse>('/api/todos/completed-today'),
  completedRange: (start: string, end: string) =>
    request<TodoListResponse>(`/api/todos/completed-range?start=${start}&end=${end}`),
  create: (content: string, url: string) =>
    request<TodoResponse>('/api/todos', {
      method: 'POST',
      body: JSON.stringify({ content, url }),
    }),
  update: (id: number, data: { content?: string; url?: string; done?: boolean }) =>
    request<TodoResponse>(`/api/todos?id=${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: number) =>
    request<MessageResponse>(`/api/todos?id=${id}`, { method: 'DELETE' }),
}

// ─── Checklists ─────────────────────────────────────────────────

export interface ChecklistItem {
  text: string
  note?: string
}

export const checklists = {
  list: () =>
    request<ChecklistListResponse>('/api/checklists'),
  create: (title: string, items: ChecklistItem[]) =>
    request<ChecklistResponse>('/api/checklists', {
      method: 'POST',
      body: JSON.stringify({ title, items }),
    }),
  update: (id: number, data: { title?: string; items?: ChecklistItem[] }) =>
    request<ChecklistResponse>(`/api/checklists?id=${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: number) =>
    request<MessageResponse>(`/api/checklists?id=${id}`, { method: 'DELETE' }),
}

export interface SnapshotData {
  checked?: boolean[]
  notes?: string[]
  extras?: { id?: string; text: string; checked?: boolean; note?: string }[]
}

export const checklistSnapshots = {
  list: (checklistId: number) =>
    request<SnapshotListResponse>(`/api/checklist-snapshots?checklist_id=${checklistId}`),
  create: (checklistId: number, title: string, itemsHash: string, data: SnapshotData) =>
    request<SnapshotResponse>('/api/checklist-snapshots', {
      method: 'POST',
      body: JSON.stringify({ checklist_id: checklistId, title, items_hash: itemsHash, data }),
    }),
  delete: (id: number) =>
    request<MessageResponse>(`/api/checklist-snapshots?id=${id}`, { method: 'DELETE' }),
}

// ─── Passkeys ───────────────────────────────────────────────────

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
  excludeCredentials?: { type: string; id: string }[]
}

export interface PasskeyRequestOptions {
  challenge: string
  challengeId: string
  rpId: string
  timeout: number
  userVerification: string
}

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

export const passkeys = {
  list: () =>
    request<PasskeyListResponse>('/api/passkeys'),
  delete: (id: number) =>
    request<MessageResponse>(`/api/passkeys?id=${id}`, { method: 'DELETE' }),
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
    return request<AuthResponse>('/api/passkeys/auth/finish', {
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

// ─── Iteration Overrides ────────────────────────────────────────

export const iterationOverrides = {
  list: () =>
    request<IterationOverrideListResponse>('/api/iteration-overrides'),
  save: (iteration_number: number, start_date: string, end_date: string) =>
    request<IterationOverrideResponse>('/api/iteration-overrides', {
      method: 'POST',
      body: JSON.stringify({ iteration_number, start_date, end_date }),
    }),
  delete: (iteration_number: number) =>
    request<MessageResponse>(`/api/iteration-overrides?iteration_number=${iteration_number}`, {
      method: 'DELETE',
    }),
}

// ─── WebDAV 同步 ─────────────────────────────────────────────────

// SyncConfigInput 用于发送配置到服务端（包含密码，不在 models.gen 中）
export interface SyncConfigInput {
  webdav_url: string
  webdav_username: string
  webdav_password: string
  remote_path: string
  auto_sync_interval_minutes: number
}

// Sync 需要的类型（SyncConfigResponse、SyncStatusResponse、SyncCheckResponse 等）
// 全部由 tygo 从 Go struct 自动生成到 models.gen.ts

export const sync = {
  getConfig: () =>
    request<SyncConfigResponse>('/api/sync/config'),
  saveConfig: (data: SyncConfigInput) =>
    request<SyncConfigResponse>('/api/sync/config', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  deleteConfig: () =>
    request<MessageResponse>('/api/sync/config', { method: 'DELETE' }),
  validate: (data?: SyncConfigInput) =>
    request<SyncValidateResponse>('/api/sync/validate', {
      method: 'POST',
      body: data ? JSON.stringify(data) : '{}',
    }),
  getStatus: () =>
    request<SyncStatusResponse>('/api/sync/status'),
  check: () =>
    request<SyncCheckResponse>('/api/sync/check', { method: 'POST' }),
  push: (force = false, loginPassword?: string) =>
    request<SyncOperationResponse>('/api/sync/push', {
      method: 'POST',
      body: JSON.stringify(loginPassword ? { force, login_password: loginPassword } : { force }),
    }),
  pull: (force = false, loginPassword?: string) =>
    request<SyncOperationResponse>('/api/sync/pull', {
      method: 'POST',
      body: JSON.stringify(loginPassword ? { force, login_password: loginPassword } : { force }),
    }),
  getLogs: () =>
    request<SyncLogListResponse>('/api/sync/logs'),
}

// ─── System ─────────────────────────────────────────────────────

export const system = {
  version: () => request<VersionResponse>('/api/system/version'),
}

// ─── History ────────────────────────────────────────────────────

export const history = {
  dateRange: () =>
    request<VersionRangeResponse>('/api/history/date-range'),
}

// ─── Push Notifications ─────────────────────────────────────────

export interface VapidKeyResponse {
  public_key: string
}

export interface PushSubscribeRequest {
  endpoint: string
  p256dh: string
  auth: string
}

export const push = {
  getVapidKey: () =>
    request<VapidKeyResponse>('/api/push/vapid-key'),
  subscribe: (data: PushSubscribeRequest) =>
    request<{ message: string }>('/api/push/subscribe', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  unsubscribe: (endpoint?: string) =>
    request<{ message: string }>('/api/push/subscribe', {
      method: 'DELETE',
      body: JSON.stringify({ endpoint }),
    }),
}

// ─── Settings ───────────────────────────────────────────────────

export const settings = {
  get: () => request<SettingsResponse>('/api/settings'),
  save: (data: { timezone?: string; kanban_url?: string; theme?: string; iteration_start_date?: string; iteration_duration_days?: string; reminder_delay?: string }) =>
    request<SettingsResponse>('/api/settings', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  changePassword: (old_password: string, new_password: string) =>
    request<MessageResponse>('/api/auth/change-password', {
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
    request<DataDeleteResponse>('/api/data/delete', {
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
