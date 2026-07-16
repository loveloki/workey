package app

// 数据模型定义

type User struct {
	ID        int64  `json:"id"`
	Username  string `json:"username"`
	CreatedAt string `json:"created_at"`
}

type Attendance struct {
	ID         int64   `json:"id"`
	UserID     int64   `json:"user_id"`
	Date       string  `json:"date"`
	ClockIn    *string `json:"clock_in"`
	ClockOut   *string `json:"clock_out"`
	Status     string  `json:"status"`
	IsOvertime bool    `json:"is_overtime"`
	CreatedAt  string  `json:"created_at"`
	UpdatedAt  string  `json:"updated_at"`
}

type WorkLog struct {
	ID        int64  `json:"id"`
	UserID    int64  `json:"user_id"`
	Date      string `json:"date"`
	Content   string `json:"content"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

type Todo struct {
	ID        int64  `json:"id"`
	UserID    int64  `json:"user_id"`
	Content   string `json:"content"`
	URL       string `json:"url"`
	Done      bool   `json:"done"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

// TicketIssue 记录工单问题、根因分类和复盘结论。
type TicketIssue struct {
	ID                 int64  `json:"id"`
	UserID             int64  `json:"user_id"`
	TicketNo           string `json:"ticket_no"`
	TicketTitle        string `json:"ticket_title"`
	TicketURL          string `json:"ticket_url"`
	OccurredOn         string `json:"occurred_on"`
	CauseType          string `json:"cause_type"`
	ProblemDescription string `json:"problem_description"`
	CauseDetail        string `json:"cause_detail"`
	Resolution         string `json:"resolution"`
	CreatedAt          string `json:"created_at"`
	UpdatedAt          string `json:"updated_at"`
}

type Checklist struct {
	ID        int64  `json:"id"`
	UserID    int64  `json:"user_id"`
	Title     string `json:"title"`
	Items     string `json:"items"` // JSON 数组字符串
	Kind      string `json:"kind"`  // manual / daily_start / iteration_end
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

type ChecklistRun struct {
	ID              int64   `json:"id"`
	UserID          int64   `json:"user_id"`
	ChecklistID     int64   `json:"checklist_id"`
	Kind            string  `json:"kind"`
	OccurrenceKey   string  `json:"occurrence_key"`
	IterationNumber *int64  `json:"iteration_number"`
	Title           string  `json:"title"`
	Items           string  `json:"items"` // 创建进度时的清单项目快照
	Data            string  `json:"data"`  // JSON: { checked: bool[], notes: string[] }
	Completed       bool    `json:"completed"`
	CompletedAt     *string `json:"completed_at"`
	CreatedAt       string  `json:"created_at"`
	UpdatedAt       string  `json:"updated_at"`
}

type ChecklistSnapshot struct {
	ID          int64  `json:"id"`
	UserID      int64  `json:"user_id"`
	ChecklistID int64  `json:"checklist_id"`
	Title       string `json:"title"`
	ItemsHash   string `json:"items_hash"`
	Data        string `json:"data"` // JSON: { checked: bool[], notes: string[], extras: [...] }
	CreatedAt   string `json:"created_at"`
}

type IterationOverride struct {
	ID              int64  `json:"id"`
	UserID          int64  `json:"user_id"`
	IterationNumber int64  `json:"iteration_number"`
	StartDate       string `json:"start_date"`
	EndDate         string `json:"end_date"`
	CreatedAt       string `json:"created_at"`
	UpdatedAt       string `json:"updated_at"`
}

// HolidayCalendarDay 只保存中国法定节假日与调休工作日等例外日期。
type HolidayCalendarDay struct {
	ID        int64  `json:"id"`
	UserID    int64  `json:"user_id"`
	Date      string `json:"date"`
	IsWorkday bool   `json:"is_workday"`
	Name      string `json:"name"`
	Source    string `json:"source"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

type HolidayCalendarImportDay struct {
	Date      string `json:"date"`
	IsWorkday bool   `json:"is_workday"`
	Name      string `json:"name"`
}

type HolidayCalendarImportRequest struct {
	Days         []HolidayCalendarImportDay `json:"days"`
	ReplaceYears bool                       `json:"replace_years"`
	Source       string                     `json:"source"`
}

type SettingsUpdateRequest struct {
	Timezone              string `json:"timezone,omitempty"`
	KanbanURL             string `json:"kanban_url,omitempty"`
	Theme                 string `json:"theme,omitempty"`
	IterationStartDate    string `json:"iteration_start_date,omitempty"`
	IterationDurationDays string `json:"iteration_duration_days,omitempty"` // 兼容旧客户端
	IterationWorkdays     string `json:"iteration_workdays,omitempty"`
	ReminderDelay         string `json:"reminder_delay,omitempty"`
}

type Passkey struct {
	ID         int64   `json:"id"`
	Name       string  `json:"name"`
	CreatedAt  string  `json:"created_at"`
	LastUsedAt *string `json:"last_used_at"`
}

type PendingReminder struct {
	ID        int64  `json:"id"`
	UserID    int64  `json:"user_id"`
	SendAt    string `json:"send_at"`
	Attempts  int    `json:"attempts"`
	CreatedAt string `json:"created_at"`
}

// PushSubscription 浏览器推送订阅信息
type PushSubscription struct {
	ID        int64  `json:"id"`
	UserID    int64  `json:"user_id"`
	Endpoint  string `json:"endpoint"`
	P256dh    string `json:"p256dh"`
	Auth      string `json:"auth"`
	CreatedAt string `json:"created_at"`
}

// 数据导出结构
type ExportData struct {
	Attendance         []Attendance         `json:"attendance"`
	WorkLogs           []WorkLog            `json:"work_logs"`
	Todos              []Todo               `json:"todos"`
	TicketIssues       []TicketIssue        `json:"ticket_issues"`
	Checklists         []Checklist          `json:"checklists"`
	ChecklistRuns      []ChecklistRun       `json:"checklist_runs"`
	ChecklistSnapshots []ChecklistSnapshot  `json:"checklist_snapshots"`
	UserSettings       map[string]string    `json:"user_settings"`
	IterationOverrides []IterationOverride  `json:"iteration_overrides"`
	HolidayCalendar    []HolidayCalendarDay `json:"holiday_calendar"`
	ExportedAt         string               `json:"exported_at"`
}
