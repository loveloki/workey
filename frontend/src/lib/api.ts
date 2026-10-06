import type {
  Attendance, WorkLog, Todo, TicketIssue, Checklist, ChecklistSnapshot,
  IterationOverride, HolidayCalendarDay, IterationRange,
  AttendanceResponse, AttendanceListResponse, AttendanceStatsResponse,
  WorkLogResponse, WorkLogListResponse,
  TodoResponse, TodoListResponse,
  TicketIssueResponse, TicketIssueListResponse, TicketIssueStatsResponse,
  ChecklistResponse, ChecklistListResponse,
  SnapshotResponse, SnapshotListResponse,
  IterationOverrideResponse, IterationOverrideListResponse, IterationListResponse,
  HolidayCalendarResponse, HolidayCalendarImportResponse, HolidayCalendarImportRequest,
  SettingsResponse, SettingsUpdateRequest, VersionResponse, VersionRangeResponse,
  MessageResponse, AuthResponse, MeResponse,
  DataImportResponse, DataDeleteResponse, RecordID,
} from './models.gen'
import { t } from './i18n'

export type AttendanceStatus = 'normal' | 'business_trip'

export type {
  Attendance, WorkLog, Todo, TicketIssue, Checklist, ChecklistSnapshot,
  IterationOverride, HolidayCalendarDay, IterationRange, AttendanceStatsResponse as AttendanceStats,
  TicketIssueStatsResponse as TicketIssueStats, SettingsUpdateRequest, HolidayCalendarImportRequest,
  RecordID,
} from './models.gen'

// 默认同源访问；前后端分开部署时可通过 VITE_API_BASE_URL 指定后端地址。
export function apiUrl(path: string): string {
  const base = (import.meta.env.VITE_API_BASE_URL ?? '')
    .trim().replace(/\/+$/, '')
  return `${base}/${path.replace(/^\/+/, '')}`
}

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

function rejectHtml(res: Response, text = '') {
  const contentType = res.headers.get('Content-Type')?.toLowerCase() ?? ''
  if (contentType.includes('html') || /^\s*<(?:!doctype\s+html|html|head|body|form)\b/i.test(text)) {
    // 代理登录页不是 Workey 的 401，不能因此清除应用 token。
    throw new Error(t('api.loginPage', { url: apiUrl('') }))
  }
}

async function fetchResponse(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken()
  const headers = Object.fromEntries(new Headers(options.headers).entries())
  if (token) headers['Authorization'] = `Bearer ${token}`
  let res: Response
  try {
    res = await fetch(apiUrl(path), { ...options, headers, credentials: 'include' })
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(t('api.connectionFailed', { url: apiUrl('') }))
    }
    throw error
  }
  rejectHtml(res)
  return res
}

async function readJsonResponse<T>(res: Response): Promise<T> {
  const text = await res.text()
  rejectHtml(res, text)
  let data: Record<string, unknown> = {}
  if (text) {
    try {
      data = JSON.parse(text)
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error()
    } catch {
      throw new Error(t(res.redirected ? 'api.loginPage' : 'api.invalidResponse', { url: apiUrl('') }))
    }
  }

  if (res.status === 401) {
    throw new ApiError(t('api.unauthorized'), 401, data)
  }
  if (!res.ok) {
    throw new ApiError((typeof data.message === 'string' && data.message) || t('api.requestFailed'), res.status, data)
  }
  return data as T
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  return readJsonResponse<T>(await fetchResponse(path, { ...options, headers }))
}

// ─── Auth ───────────────────────────────────────────────────────

export const auth = {
  register: (username: string, password: string) =>
    request<AuthResponse>('/api/workey/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  login: (username: string, password: string) =>
    request<AuthResponse>('/api/workey/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  me: () => request<MeResponse>('/api/workey/auth/me'),
  // 用当前 token 换取新 token（后端不再通过响应头续期）
  refresh: () => request<AuthResponse>('/api/workey/auth/refresh', { method: 'POST' }),
}

// ─── Attendance ─────────────────────────────────────────────────

export const attendance = {
  clockIn: (isOvertime?: boolean, status: AttendanceStatus = 'normal') => request<AttendanceResponse>('/api/workey/attendance/clock-in', {
    method: 'POST',
    body: JSON.stringify({ is_overtime: !!isOvertime, status }),
  }),
  setOvertime: (date: string, is_overtime: boolean) => request<AttendanceResponse>('/api/workey/attendance/overtime', {
    method: 'POST',
    body: JSON.stringify({ date, is_overtime }),
  }),
  clockOut: () => request<AttendanceResponse>('/api/workey/attendance/clock-out', { method: 'POST' }),
  leave: () => request<AttendanceResponse>('/api/workey/attendance/leave', { method: 'POST' }),
  today: () => request<AttendanceResponse>('/api/workey/attendance/today'),
  range: (start: string, end: string) =>
    request<AttendanceListResponse>(`/api/workey/attendance/range?start=${start}&end=${end}`),
  stats: () => request<AttendanceStatsResponse>('/api/workey/attendance/stats'),
}

// ─── Work Logs ──────────────────────────────────────────────────

export const workLogs = {
  save: (date: string, content: string) =>
    request<WorkLogResponse>('/api/workey/work-logs', {
      method: 'POST',
      body: JSON.stringify({ date, content }),
    }),
  today: () => request<WorkLogResponse>('/api/workey/work-logs/today'),
  range: (start: string, end: string) =>
    request<WorkLogListResponse>(`/api/workey/work-logs/range?start=${start}&end=${end}`),
}

// ─── Todos ──────────────────────────────────────────────────────

export const todos = {
  list: (all = false) =>
    request<TodoListResponse>(`/api/workey/todos${all ? '?all=1' : ''}`),
  createdToday: () =>
    request<TodoListResponse>('/api/workey/todos/created-today'),
  completedToday: () =>
    request<TodoListResponse>('/api/workey/todos/completed-today'),
  completedRange: (start: string, end: string) =>
    request<TodoListResponse>(`/api/workey/todos/completed-range?start=${start}&end=${end}`),
  create: (content: string, url: string) =>
    request<TodoResponse>('/api/workey/todos', {
      method: 'POST',
      body: JSON.stringify({ content, url }),
    }),
  update: (id: RecordID, data: { content?: string; url?: string; done?: boolean }) =>
    request<TodoResponse>(`/api/workey/todos?id=${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: RecordID) =>
    request<MessageResponse>(`/api/workey/todos?id=${id}`, { method: 'DELETE' }),
}

// ─── Ticket Issues ──────────────────────────────────────────────

export type TicketCauseType = 'code' | 'operation'

export interface TicketIssueInput {
  ticket_no: string
  ticket_title: string
  ticket_url: string
  occurred_on: string
  cause_type: TicketCauseType
  problem_description: string
  cause_detail: string
  resolution: string
}

export interface TicketIssueFilters {
  start?: string
  end?: string
  cause_type?: TicketCauseType | ''
  q?: string
}

function ticketIssueQuery(filters: TicketIssueFilters, includeCause = true): string {
  const params = new URLSearchParams()
  if (filters.start) params.set('start', filters.start)
  if (filters.end) params.set('end', filters.end)
  if (includeCause && filters.cause_type) params.set('cause_type', filters.cause_type)
  if (filters.q) params.set('q', filters.q)
  const query = params.toString()
  return query ? `?${query}` : ''
}

export const ticketIssues = {
  list: (filters: TicketIssueFilters = {}) =>
    request<TicketIssueListResponse>(`/api/workey/ticket-issues${ticketIssueQuery(filters)}`),
  stats: (filters: TicketIssueFilters = {}) =>
    request<TicketIssueStatsResponse>(`/api/workey/ticket-issues/stats${ticketIssueQuery(filters, false)}`),
  create: (data: TicketIssueInput) =>
    request<TicketIssueResponse>('/api/workey/ticket-issues', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: RecordID, data: TicketIssueInput) =>
    request<TicketIssueResponse>(`/api/workey/ticket-issues?id=${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: RecordID) =>
    request<MessageResponse>(`/api/workey/ticket-issues?id=${id}`, { method: 'DELETE' }),
}

// ─── Checklists ─────────────────────────────────────────────────

export interface ChecklistItem {
  text: string
  note?: string
}

export const checklists = {
  list: () =>
    request<ChecklistListResponse>('/api/workey/checklists'),
  create: (title: string, items: ChecklistItem[]) =>
    request<ChecklistResponse>('/api/workey/checklists', {
      method: 'POST',
      body: JSON.stringify({ title, items }),
    }),
  update: (id: RecordID, data: { title?: string; items?: ChecklistItem[] }) =>
    request<ChecklistResponse>(`/api/workey/checklists?id=${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: RecordID) =>
    request<MessageResponse>(`/api/workey/checklists?id=${id}`, { method: 'DELETE' }),
}

export interface SnapshotData {
  checked?: boolean[]
  notes?: string[]
  extras?: { id?: string; text: string; checked?: boolean; note?: string }[]
}

export const checklistSnapshots = {
  list: (checklistId: RecordID) =>
    request<SnapshotListResponse>(`/api/workey/checklist-snapshots?checklist_id=${checklistId}`),
  create: (checklistId: RecordID, title: string, itemsHash: string, data: SnapshotData) =>
    request<SnapshotResponse>('/api/workey/checklist-snapshots', {
      method: 'POST',
      body: JSON.stringify({ checklist_id: checklistId, title, items_hash: itemsHash, data }),
    }),
  delete: (id: RecordID) =>
    request<MessageResponse>(`/api/workey/checklist-snapshots?id=${id}`, { method: 'DELETE' }),
}

// ─── Iteration Overrides ────────────────────────────────────────

export const iterations = {
  list: () => request<IterationListResponse>('/api/workey/iterations'),
}

export const iterationOverrides = {
  list: () =>
    request<IterationOverrideListResponse>('/api/workey/iteration-overrides'),
  save: (iteration_number: number, start_date: string, end_date: string) =>
    request<IterationOverrideResponse>('/api/workey/iteration-overrides', {
      method: 'POST',
      body: JSON.stringify({ iteration_number, start_date, end_date }),
    }),
  delete: (iteration_number: number) =>
    request<MessageResponse>(`/api/workey/iteration-overrides?iteration_number=${iteration_number}`, {
      method: 'DELETE',
    }),
}

export const holidayCalendar = {
  get: () => request<HolidayCalendarResponse>('/api/workey/holiday-calendar'),
  import: (data: HolidayCalendarImportRequest) =>
    request<HolidayCalendarImportResponse>('/api/workey/holiday-calendar', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  deleteYear: (year: number) =>
    request<MessageResponse>(`/api/workey/holiday-calendar?year=${year}`, { method: 'DELETE' }),
}

// ─── System ─────────────────────────────────────────────────────

export const system = {
  version: () => request<VersionResponse>('/api/workey/system/version'),
}

// ─── History ────────────────────────────────────────────────────

export const history = {
  dateRange: () =>
    request<VersionRangeResponse>('/api/workey/history/date-range'),
}

// ─── Settings ───────────────────────────────────────────────────

export const settings = {
  get: () => request<SettingsResponse>('/api/workey/settings'),
  save: (data: SettingsUpdateRequest) =>
    request<SettingsResponse>('/api/workey/settings', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  changePassword: (old_password: string, new_password: string) =>
    request<AuthResponse>('/api/workey/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ old_password, new_password }),
    }),
  exportData: async (): Promise<Blob> => {
    const res = await fetchResponse('/api/workey/data/export')
    if (!res.ok) await readJsonResponse(res)
    const blob = await res.blob()
    rejectHtml(res, await blob.slice(0, 512).text())
      return blob
  },
  deleteData: (password: string) =>
    request<DataDeleteResponse>('/api/workey/data/delete', {
      method: 'DELETE',
      body: JSON.stringify({ password }),
    }),
  importData: async (file: File): Promise<DataImportResponse> => {
    const form = new FormData()
    form.append('file', file)
    return request<DataImportResponse>('/api/workey/data/import', {
      method: 'POST',
      body: form,
    })
  },
}
