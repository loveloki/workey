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

// ─── Settings ───────────────────────────────────────────────

type SettingsResponse struct {
	Timezone              string `json:"timezone"`
	KanbanURL             string `json:"kanban_url"`
	Theme                 string `json:"theme"`
	IterationStartDate    string `json:"iteration_start_date"`
	IterationDurationDays string `json:"iteration_duration_days"`
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
	Message         string `json:"message"`
	AttendanceCount int    `json:"attendance_count"`
	WorkLogCount    int    `json:"work_log_count"`
	TodoCount       int    `json:"todo_count"`
	ChecklistCount  int    `json:"checklist_count"`
	SnapshotCount   int    `json:"snapshot_count"`
	OverrideCount   int    `json:"override_count"`
}

type DataDeleteResponse struct {
	Message         string `json:"message"`
	AttendanceCount int64  `json:"attendance_count"`
	WorkLogCount    int64  `json:"work_log_count"`
	TodoCount       int64  `json:"todo_count"`
}

// ─── Sync ────────────────────────────────────────────────────────────────────────

// SyncConfigResponse WebDAV 配置信息（密码脚敏信息不返回）
type SyncConfigResponse struct {
	Configured     bool   `json:"configured"`
	WebDAVURL      string `json:"webdav_url"`
	WebDAVUsername string `json:"webdav_username"`
	RemotePath     string `json:"remote_path"`
	CreatedAt      string `json:"created_at"`
	UpdatedAt      string `json:"updated_at"`
	Warning        string `json:"warning,omitempty"`
}

// SyncStatusResponse 当前同步状态
type SyncStatusResponse struct {
	Configured        bool    `json:"configured"`
	LastSyncAt        *string `json:"last_sync_at"`
	LastDirection     *string `json:"last_direction"`
	LastLocalHash     *string `json:"last_local_hash"`
	LastRemoteHash    *string `json:"last_remote_hash"`
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
