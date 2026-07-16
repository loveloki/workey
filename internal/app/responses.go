package app

import (
	"encoding/json"
	"net/http"
)

// API 响应类型定义
// 前端 TypeScript 类型由 tygo 从这些结构体自动生成

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

type ChecklistRunResponse struct {
	Run ChecklistRun `json:"run"`
}

type ChecklistReminder struct {
	Kind            string        `json:"kind"`
	OccurrenceKey   string        `json:"occurrence_key"`
	Label           string        `json:"label"`
	DueDate         string        `json:"due_date"`
	IterationNumber *int64        `json:"iteration_number"`
	IterationStart  string        `json:"iteration_start,omitempty"`
	IterationEnd    string        `json:"iteration_end,omitempty"`
	Checklist       Checklist     `json:"checklist"`
	Run             *ChecklistRun `json:"run"`
}

type ChecklistReminderListResponse struct {
	Reminders []ChecklistReminder `json:"reminders"`
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
	KanbanURL             string `json:"kanban_url"`
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

// ─── Passkeys ───────────────────────────────────────────────

type PasskeyListResponse struct {
	Passkeys []Passkey `json:"passkeys"`
}

type PasskeyRegisterResponse struct {
	Passkey Passkey `json:"passkey"`
}

// PasskeyAuthBeginResponse 返回 WebAuthn 认证挑战参数
type PasskeyAuthBeginResponse struct {
	Challenge        interface{} `json:"challenge" tstype:"string"`
	ChallengeID      string      `json:"challengeId"`
	RPID             string      `json:"rpId"`
	Timeout          int         `json:"timeout"`
	UserVerification string      `json:"userVerification"`
}

// ─── Data ───────────────────────────────────────────────────

type DataImportResponse struct {
	Message           string `json:"message"`
	AttendanceCount   int    `json:"attendance_count"`
	WorkLogCount      int    `json:"work_log_count"`
	TodoCount         int    `json:"todo_count"`
	TicketIssueCount  int    `json:"ticket_issue_count"`
	ChecklistCount    int    `json:"checklist_count"`
	ChecklistRunCount int    `json:"checklist_run_count"`
	SnapshotCount     int    `json:"snapshot_count"`
	OverrideCount     int    `json:"override_count"`
	CalendarDayCount  int    `json:"calendar_day_count"`
}

type DataDeleteResponse struct {
	Message          string `json:"message"`
	AttendanceCount  int64  `json:"attendance_count"`
	WorkLogCount     int64  `json:"work_log_count"`
	TodoCount        int64  `json:"todo_count"`
	TicketIssueCount int64  `json:"ticket_issue_count"`
}

// ─── Push Notifications ──────────────────────────────────────────────────────────

type VapidKeyResponse struct {
	PublicKey string `json:"public_key"`
}

type PushSubscribeRequest struct {
	Endpoint string `json:"endpoint"`
	P256dh   string `json:"p256dh"`
	Auth     string `json:"auth"`
}

// ─── Sync ────────────────────────────────────────────────────────────────────────

// SyncConfigResponse WebDAV 配置信息（密码脚敏信息不返回）
type SyncConfigResponse struct {
	Configured              bool   `json:"configured"`
	WebDAVURL               string `json:"webdav_url"`
	WebDAVUsername          string `json:"webdav_username"`
	RemotePath              string `json:"remote_path"`
	AutoSyncIntervalMinutes int    `json:"auto_sync_interval_minutes"`
	CreatedAt               string `json:"created_at"`
	UpdatedAt               string `json:"updated_at"`
	Warning                 string `json:"warning,omitempty"`
}

// SyncStatusResponse 当前同步状态
type SyncStatusResponse struct {
	Configured     bool    `json:"configured"`
	LastSyncAt     *string `json:"last_sync_at"`
	LastDirection  *string `json:"last_direction"`
	LastLocalHash  *string `json:"last_local_hash"`
	LastRemoteHash *string `json:"last_remote_hash"`
}

// SyncCheckResponse 冲突检测结果
type SyncCheckResponse struct {
	Status            string `json:"status"` // ok / conflict / remote_ahead / local_ahead / no_config / first_sync
	CurrentLocalHash  string `json:"current_local_hash"`
	CurrentRemoteHash string `json:"current_remote_hash"`
	LastLocalHash     string `json:"last_local_hash"`
	LastRemoteHash    string `json:"last_remote_hash"`
	Message           string `json:"message"`
}

// SyncOperationResponse push/pull 操作结果
type SyncOperationResponse struct {
	Message    string `json:"message"`
	LocalHash  string `json:"local_hash"`
	RemoteHash string `json:"remote_hash"`
}

// SyncConflictResponse 冲突响应（HTTP 409）
type SyncConflictResponse struct {
	Error             string `json:"error"`
	CurrentLocalHash  string `json:"current_local_hash"`
	CurrentRemoteHash string `json:"current_remote_hash"`
	LastLocalHash     string `json:"last_local_hash"`
	LastRemoteHash    string `json:"last_remote_hash"`
}

// SyncLogListResponse 同步日志列表
type SyncLogListResponse struct {
	Logs []SyncLog `json:"logs"`
}

// SyncValidateResponse 验证 WebDAV 连接结果
type SyncValidateResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

// jsonStatus 返回任意状态码的 JSON 响应，确保统一设置 Content-Type
func jsonStatus(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
