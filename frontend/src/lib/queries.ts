import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  attendance, workLogs, todos, ticketIssues, checklists, checklistSnapshots,
  settings, iterations, iterationOverrides, holidayCalendar, passkeys, system, history, sync,
  type Attendance, type WorkLog, type Todo, type Checklist,
  type ChecklistItem, type SnapshotData, type AttendanceStats,
  type TicketIssueInput, type TicketIssueFilters, type SyncConfigInput,
  type SettingsUpdateRequest, type HolidayCalendarImportRequest,
} from './api'

// ─── Query Keys ──────────────────────────────────────────────────
// 集中管理所有 query key，方便 invalidation 和类型推导

export const queryKeys = {
  attendance: {
    today: ['attendance', 'today'] as const,
    range: (start: string, end: string) => ['attendance', 'range', start, end] as const,
    stats: ['attendance', 'stats'] as const,
  },
  workLogs: {
    today: ['workLogs', 'today'] as const,
    range: (start: string, end: string) => ['workLogs', 'range', start, end] as const,
  },
  todos: {
    list: (all: boolean) => ['todos', 'list', all] as const,
    completedToday: ['todos', 'completedToday'] as const,
    createdToday: ['todos', 'createdToday'] as const,
    completedRange: (start: string, end: string) => ['todos', 'completedRange', start, end] as const,
  },
  ticketIssues: {
    list: (filters: TicketIssueFilters) => ['ticketIssues', 'list', filters] as const,
    stats: (filters: TicketIssueFilters) => ['ticketIssues', 'stats', filters] as const,
  },
  checklists: {
    list: ['checklists'] as const,
  },
  checklistSnapshots: {
    list: (checklistId: number) => ['checklistSnapshots', checklistId] as const,
  },
  settings: ['settings'] as const,
  iterations: ['iterations'] as const,
  iterationOverrides: ['iterationOverrides'] as const,
  holidayCalendar: ['holidayCalendar'] as const,
  passkeys: ['passkeys'] as const,
  systemVersion: ['system', 'version'] as const,
  historyDateRange: ['history', 'dateRange'] as const,
  sync: {
    config: ['sync', 'config'] as const,
    status: ['sync', 'status'] as const,
    logs: ['sync', 'logs'] as const,
  },
}

// ─── Attendance Queries ──────────────────────────────────────────

export function useAttendanceToday(enabled = true) {
  return useQuery({
    queryKey: queryKeys.attendance.today,
    queryFn: () => attendance.today(),
    enabled,
  })
}

export function useAttendanceRange(start: string, end: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.attendance.range(start, end),
    queryFn: () => attendance.range(start, end),
    enabled: enabled && !!start && !!end,
  })
}

export function useAttendanceStats(enabled = true) {
  return useQuery({
    queryKey: queryKeys.attendance.stats,
    queryFn: () => attendance.stats(),
    enabled,
  })
}

// ─── Attendance Mutations ────────────────────────────────────────

export function useClockIn() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (isOvertime?: boolean) => attendance.clockIn(isOvertime),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.attendance.today }) },
  })
}

export function useClockOut() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => attendance.clockOut(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.attendance.today }) },
  })
}

export function useLeave() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => attendance.leave(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.attendance.today }) },
  })
}

export function useSetOvertime() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ date, isOvertime }: { date: string; isOvertime: boolean }) =>
      attendance.setOvertime(date, isOvertime),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance'] })
    },
  })
}

// ─── WorkLog Queries ─────────────────────────────────────────────

export function useWorkLogToday(enabled = true) {
  return useQuery({
    queryKey: queryKeys.workLogs.today,
    queryFn: () => workLogs.today(),
    enabled,
  })
}

export function useWorkLogRange(start: string, end: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.workLogs.range(start, end),
    queryFn: () => workLogs.range(start, end),
    enabled: enabled && !!start && !!end,
  })
}

export function useSaveWorkLog() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ date, content }: { date: string; content: string }) =>
      workLogs.save(date, content),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workLogs'] })
    },
  })
}

// ─── Todo Queries ────────────────────────────────────────────────

export function useTodoList(all: boolean, enabled = true) {
  return useQuery({
    queryKey: queryKeys.todos.list(all),
    queryFn: () => todos.list(all),
    enabled,
  })
}

export function useCompletedTodosToday(enabled = true) {
  return useQuery({
    queryKey: queryKeys.todos.completedToday,
    queryFn: () => todos.completedToday(),
    refetchInterval: 30_000,
    enabled,
  })
}

export function useCreatedTodosToday(enabled = true) {
  return useQuery({
    queryKey: queryKeys.todos.createdToday,
    queryFn: () => todos.createdToday(),
    refetchInterval: 30_000,
    enabled,
  })
}

export function useCompletedTodosRange(start: string, end: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.todos.completedRange(start, end),
    queryFn: () => todos.completedRange(start, end),
    enabled: enabled && !!start && !!end,
  })
}

// ─── Todo Mutations ──────────────────────────────────────────────

export function useCreateTodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ content, url }: { content: string; url: string }) =>
      todos.create(content, url),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['todos'] })
    },
  })
}

export function useUpdateTodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { content?: string; url?: string; done?: boolean } }) =>
      todos.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['todos'] })
    },
  })
}

export function useDeleteTodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => todos.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['todos'] })
    },
  })
}

// ─── Ticket Issue Queries ───────────────────────────────────────

export function useTicketIssueList(filters: TicketIssueFilters, enabled = true) {
  return useQuery({
    queryKey: queryKeys.ticketIssues.list(filters),
    queryFn: () => ticketIssues.list(filters),
    enabled,
  })
}

export function useTicketIssueStats(filters: TicketIssueFilters, enabled = true) {
  return useQuery({
    queryKey: queryKeys.ticketIssues.stats(filters),
    queryFn: () => ticketIssues.stats(filters),
    enabled,
  })
}

export function useCreateTicketIssue() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: TicketIssueInput) => ticketIssues.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ticketIssues'] }) },
  })
}

export function useUpdateTicketIssue() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: TicketIssueInput }) => ticketIssues.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ticketIssues'] }) },
  })
}

export function useDeleteTicketIssue() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => ticketIssues.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ticketIssues'] }) },
  })
}

// ─── Checklist Queries ───────────────────────────────────────────

export function useChecklistList(enabled = true) {
  return useQuery({
    queryKey: queryKeys.checklists.list,
    queryFn: () => checklists.list(),
    enabled,
  })
}

export function useChecklistSnapshots(checklistId: number, enabled = true) {
  return useQuery({
    queryKey: queryKeys.checklistSnapshots.list(checklistId),
    queryFn: () => checklistSnapshots.list(checklistId),
    enabled: enabled && checklistId > 0,
  })
}

// ─── Checklist Mutations ─────────────────────────────────────────

export function useCreateChecklist() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ title, items }: { title: string; items: ChecklistItem[] }) =>
      checklists.create(title, items),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.checklists.list })
    },
  })
}

export function useUpdateChecklist() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { title?: string; items?: ChecklistItem[] } }) =>
      checklists.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.checklists.list })
    },
  })
}

export function useDeleteChecklist() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => checklists.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.checklists.list })
    },
  })
}

export function useCreateSnapshot() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ checklistId, title, itemsHash, data }: {
      checklistId: number; title: string; itemsHash: string; data: SnapshotData
    }) => checklistSnapshots.create(checklistId, title, itemsHash, data),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.checklistSnapshots.list(vars.checklistId) })
    },
  })
}

export function useDeleteSnapshot() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, checklistId }: { id: number; checklistId: number }) =>
      checklistSnapshots.delete(id),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.checklistSnapshots.list(vars.checklistId) })
    },
  })
}

// ─── Settings Queries ────────────────────────────────────────────

export function useSettings(enabled = true) {
  return useQuery({
    queryKey: queryKeys.settings,
    queryFn: () => settings.get(),
    enabled,
  })
}

export function useSaveSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: SettingsUpdateRequest) => settings.save(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.settings })
      qc.invalidateQueries({ queryKey: queryKeys.iterations })
    },
  })
}

// ─── Iterations ──────────────────────────────────────────────────

export function useIterations(enabled = true) {
  return useQuery({
    queryKey: queryKeys.iterations,
    queryFn: () => iterations.list(),
    enabled,
  })
}

export function useIterationOverrides(enabled = true) {
  return useQuery({
    queryKey: queryKeys.iterationOverrides,
    queryFn: () => iterationOverrides.list(),
    enabled,
  })
}

export function useSaveIterationOverride() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ iterationNumber, startDate, endDate }: {
      iterationNumber: number; startDate: string; endDate: string
    }) => iterationOverrides.save(iterationNumber, startDate, endDate),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.iterationOverrides })
      qc.invalidateQueries({ queryKey: queryKeys.iterations })
    },
  })
}

export function useDeleteIterationOverride() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (iterationNumber: number) => iterationOverrides.delete(iterationNumber),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.iterationOverrides })
      qc.invalidateQueries({ queryKey: queryKeys.iterations })
    },
  })
}

export function useHolidayCalendar(enabled = true) {
  return useQuery({
    queryKey: queryKeys.holidayCalendar,
    queryFn: () => holidayCalendar.get(),
    enabled,
  })
}

export function useImportHolidayCalendar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: HolidayCalendarImportRequest) => holidayCalendar.import(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.holidayCalendar })
      qc.invalidateQueries({ queryKey: queryKeys.iterations })
    },
  })
}

export function useDeleteHolidayCalendarYear() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (year: number) => holidayCalendar.deleteYear(year),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.holidayCalendar })
      qc.invalidateQueries({ queryKey: queryKeys.iterations })
    },
  })
}

// ─── Passkeys ────────────────────────────────────────────────────

export function usePasskeyList(enabled = true) {
  return useQuery({
    queryKey: queryKeys.passkeys,
    queryFn: () => passkeys.list(),
    enabled,
  })
}

export function useDeletePasskey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => passkeys.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.passkeys })
    },
  })
}

// ─── System ──────────────────────────────────────────────────────

export function useSystemVersion(enabled = true) {
  return useQuery({
    queryKey: queryKeys.systemVersion,
    queryFn: () => system.version(),
    enabled,
    staleTime: Infinity,
  })
}

// ─── History ─────────────────────────────────────────────────────

export function useHistoryDateRange(enabled = true) {
  return useQuery({
    queryKey: queryKeys.historyDateRange,
    queryFn: () => history.dateRange(),
    enabled,
    staleTime: 60_000,
  })
}

// ─── Sync Queries ─────────────────────────────────────────────────

export function useSyncConfig(enabled = true) {
  return useQuery({
    queryKey: queryKeys.sync.config,
    queryFn: () => sync.getConfig(),
    enabled,
    staleTime: 60_000,
  })
}

export function useSyncStatus(enabled = true) {
  return useQuery({
    queryKey: queryKeys.sync.status,
    queryFn: () => sync.getStatus(),
    enabled,
    staleTime: 30_000,
  })
}

export function useSyncLogs(enabled = true) {
  return useQuery({
    queryKey: queryKeys.sync.logs,
    queryFn: () => sync.getLogs(),
    enabled,
    staleTime: 60_000,
  })
}

export function useSaveSyncConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: SyncConfigInput) => sync.saveConfig(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.sync.config })
      qc.invalidateQueries({ queryKey: queryKeys.sync.status })
    },
  })
}

export function useDeleteSyncConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => sync.deleteConfig(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.sync.config })
      qc.invalidateQueries({ queryKey: queryKeys.sync.status })
    },
  })
}

export function useValidateSyncConfig() {
  return useMutation({
    mutationFn: (data?: SyncConfigInput) => sync.validate(data),
  })
}

export function useSyncCheck() {
  return useMutation({
    mutationFn: () => sync.check(),
  })
}

export function useSyncPush() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ force, loginPassword }: { force: boolean; loginPassword?: string }) => sync.push(force, loginPassword),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.sync.status })
      qc.invalidateQueries({ queryKey: queryKeys.sync.logs })
    },
  })
}

export function useSyncPull() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ force, loginPassword }: { force: boolean; loginPassword?: string }) => sync.pull(force, loginPassword),
    onSuccess: () => {
      // 拉取后本地数据可能发生变化，精确刷新所有相关缓存
      qc.invalidateQueries({ queryKey: queryKeys.sync.status })
      qc.invalidateQueries({ queryKey: queryKeys.sync.logs })
      qc.invalidateQueries({ queryKey: ['attendance'] })
      qc.invalidateQueries({ queryKey: ['workLogs'] })
      qc.invalidateQueries({ queryKey: ['todos'] })
      qc.invalidateQueries({ queryKey: ['ticketIssues'] })
      qc.invalidateQueries({ queryKey: queryKeys.checklists.list })
      qc.invalidateQueries({ queryKey: ['settings'] })
      qc.invalidateQueries({ queryKey: ['iterationOverrides'] })
    },
  })
}
