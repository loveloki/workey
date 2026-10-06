import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  attendance, workLogs, todos, ticketIssues, checklists, checklistSnapshots,
  settings, iterations, iterationOverrides, holidayCalendar, system, history,
  type Attendance, type WorkLog, type Todo, type Checklist,
  type ChecklistItem, type SnapshotData, type AttendanceStats,
  type TicketIssueInput, type TicketIssueFilters, type RecordID,
  type SettingsUpdateRequest, type HolidayCalendarImportRequest, type AttendanceStatus,
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
    list: (checklistId: RecordID) => ['checklistSnapshots', checklistId] as const,
  },
  settings: ['settings'] as const,
  iterations: ['iterations'] as const,
  iterationOverrides: ['iterationOverrides'] as const,
  holidayCalendar: ['holidayCalendar'] as const,
  systemVersion: ['system', 'version'] as const,
  historyDateRange: ['history', 'dateRange'] as const,
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
    mutationFn: ({ isOvertime, status }: { isOvertime?: boolean; status?: AttendanceStatus } = {}) =>
      attendance.clockIn(isOvertime, status),
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
    mutationFn: ({ id, data }: { id: RecordID; data: { content?: string; url?: string; done?: boolean } }) =>
      todos.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['todos'] })
    },
  })
}

export function useDeleteTodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: RecordID) => todos.delete(id),
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
    mutationFn: ({ id, data }: { id: RecordID; data: TicketIssueInput }) => ticketIssues.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ticketIssues'] }) },
  })
}

export function useDeleteTicketIssue() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: RecordID) => ticketIssues.delete(id),
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

export function useChecklistSnapshots(checklistId: RecordID, enabled = true) {
  return useQuery({
    queryKey: queryKeys.checklistSnapshots.list(checklistId),
    queryFn: () => checklistSnapshots.list(checklistId),
    enabled: enabled && !!checklistId,
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
    mutationFn: ({ id, data }: { id: RecordID; data: { title?: string; items?: ChecklistItem[] } }) =>
      checklists.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.checklists.list })
    },
  })
}

export function useDeleteChecklist() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: RecordID) => checklists.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.checklists.list })
    },
  })
}

export function useCreateSnapshot() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ checklistId, title, itemsHash, data }: {
      checklistId: RecordID; title: string; itemsHash: string; data: SnapshotData
    }) => checklistSnapshots.create(checklistId, title, itemsHash, data),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.checklistSnapshots.list(vars.checklistId) })
    },
  })
}

export function useDeleteSnapshot() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, checklistId }: { id: RecordID; checklistId: RecordID }) =>
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
