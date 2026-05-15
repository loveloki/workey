package app

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

// ─── Lessons ────────────────────────────────────────────────

type LessonResponse struct {
	Lesson *Lesson `json:"lesson"`
}

type LessonListResponse struct {
	Lessons []Lesson `json:"lessons"`
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

// ─── Data ───────────────────────────────────────────────────

type DataImportResponse struct {
	Message         string `json:"message"`
	AttendanceCount int    `json:"attendance_count"`
	WorkLogCount    int    `json:"work_log_count"`
	LessonCount     int    `json:"lesson_count"`
	ChecklistCount  int    `json:"checklist_count"`
	SnapshotCount   int    `json:"snapshot_count"`
}

type DataDeleteResponse struct {
	Message         string `json:"message"`
	AttendanceCount int64  `json:"attendance_count"`
	WorkLogCount    int64  `json:"work_log_count"`
	LessonCount     int64  `json:"lesson_count"`
	TodoCount       int64  `json:"todo_count"`
}
