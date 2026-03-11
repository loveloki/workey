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

// Settings
export const settings = {
  get: () => request<{ timezone: string }>('/api/settings'),
  save: (timezone: string) =>
    request<{ timezone: string }>('/api/settings', {
      method: 'POST',
      body: JSON.stringify({ timezone }),
    }),
  changePassword: (old_password: string, new_password: string) =>
    request<{ message: string }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ old_password, new_password }),
    }),
  exportData: () => request<any>('/api/data/export'),
  importData: (data: any) =>
    request<{ message: string; attendance_count: number; work_log_count: number }>('/api/data/import', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
}
