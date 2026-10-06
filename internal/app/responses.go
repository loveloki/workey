package app

// API 响应类型定义
// 前端 TypeScript 类型由 tygo 从这些结构体自动生成
// 错误响应统一由 PocketBase ApiError 输出：{"status": 400, "message": "...", "data": {}}

// ─── 通用 ───────────────────────────────────────────────────

type MessageResponse struct {
	Message string `json:"message"`
}

// ─── Auth ───────────────────────────────────────────────────

type AuthResponse struct {
	Token string `json:"token"`
	User  User   `json:"user"`
}

type MeResponse struct {
	User User `json:"user"`
}

// ─── Attendance ─────────────────────────────────────────────

type AttendanceResponse struct {
	Attendance *Attendance `json:"attendance"`
}

type AttendanceListResponse struct {
	Attendances []Attendance `json:"attendances"`
}

type AttendanceStatsResponse struct {
	GlobalOvertimeDays int64 `json:"global_overtime_days"`
	GlobalLeaveDays    int64 `json:"global_leave_days"`
	GlobalRemaining    int64 `json:"global_remaining"`
}

// ─── Work Logs ──────────────────────────────────────────────

type WorkLogResponse struct {
	WorkLog *WorkLog `json:"work_log"`
}

type WorkLogListResponse struct {
	WorkLogs []WorkLog `json:"work_logs"`
}

// ─── Todos ──────────────────────────────────────────────────

type TodoResponse struct {
	Todo Todo `json:"todo"`
}

type TodoListResponse struct {
	Todos []Todo `json:"todos"`
}

// ─── Ticket Issues ──────────────────────────────────────────

type TicketIssueResponse struct {
	TicketIssue TicketIssue `json:"ticket_issue"`
}

type TicketIssueListResponse struct {
	TicketIssues []TicketIssue `json:"ticket_issues"`
}

type TicketIssueStatsResponse struct {
	TotalCount     int64 `json:"total_count"`
	CodeCount      int64 `json:"code_count"`
	OperationCount int64 `json:"operation_count"`
}

// ─── Checklists ─────────────────────────────────────────────

type ChecklistResponse struct {
	Checklist Checklist `json:"checklist"`
}

type ChecklistListResponse struct {
	Checklists []Checklist `json:"checklists"`
}

type SnapshotResponse struct {
	Snapshot ChecklistSnapshot `json:"snapshot"`
}

type SnapshotListResponse struct {
	Snapshots []ChecklistSnapshot `json:"snapshots"`
}

// ─── Iterations ─────────────────────────────────────────────

type IterationOverrideResponse struct {
	Override IterationOverride `json:"override"`
}

type IterationOverrideListResponse struct {
	Overrides []IterationOverride `json:"overrides"`
}

type IterationRange struct {
	IterationNumber int64  `json:"iteration_number"`
	StartDate       string `json:"start_date"`
	EndDate         string `json:"end_date"`
	CalendarDays    int    `json:"calendar_days"`
	Workdays        int    `json:"workdays"`
	IsOverridden    bool   `json:"is_overridden"`
}

type IterationListResponse struct {
	CurrentIteration int64            `json:"current_iteration"`
	Iterations       []IterationRange `json:"iterations"`
}

type HolidayCalendarYearSummary struct {
	Year         int `json:"year"`
	DayCount     int `json:"day_count"`
	HolidayCount int `json:"holiday_count"`
	WorkdayCount int `json:"workday_count"`
}

type HolidayCalendarResponse struct {
	Days  []HolidayCalendarDay         `json:"days"`
	Years []HolidayCalendarYearSummary `json:"years"`
}

type HolidayCalendarImportResponse struct {
	ImportedCount int   `json:"imported_count"`
	ReplacedYears []int `json:"replaced_years"`
}

// ─── Settings ───────────────────────────────────────────────

type SettingsResponse struct {
	Timezone              string `json:"timezone"`
	Theme                 string `json:"theme"`
	IterationStartDate    string `json:"iteration_start_date"`
	IterationDurationDays string `json:"iteration_duration_days"` // 兼容旧客户端
	IterationWorkdays     string `json:"iteration_workdays"`
	ReminderDelay         string `json:"reminder_delay"`
}

// ─── System ─────────────────────────────────────────────────

type VersionResponse struct {
	Commit  string `json:"commit"`
	Date    string `json:"date"`
	Content string `json:"content"`
}

type VersionRangeResponse struct {
	Earliest *string `json:"earliest"`
	Latest   *string `json:"latest"`
}

// ─── Data ───────────────────────────────────────────────────

type DataImportResponse struct {
	Message          string `json:"message"`
	AttendanceCount  int    `json:"attendance_count"`
	WorkLogCount     int    `json:"work_log_count"`
	TodoCount        int    `json:"todo_count"`
	TicketIssueCount int    `json:"ticket_issue_count"`
	ChecklistCount   int    `json:"checklist_count"`
	SnapshotCount    int    `json:"snapshot_count"`
	OverrideCount    int    `json:"override_count"`
	CalendarDayCount int    `json:"calendar_day_count"`
}

type DataDeleteResponse struct {
	Message          string `json:"message"`
	AttendanceCount  int64  `json:"attendance_count"`
	WorkLogCount     int64  `json:"work_log_count"`
	TodoCount        int64  `json:"todo_count"`
	TicketIssueCount int64  `json:"ticket_issue_count"`
}
