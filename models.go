package main

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

type Lesson struct {
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

type Checklist struct {
	ID        int64  `json:"id"`
	UserID    int64  `json:"user_id"`
	Title     string `json:"title"`
	Items     string `json:"items"` // JSON 数组字符串
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
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

// 数据导出结构
type ExportData struct {
	Attendance         []Attendance        `json:"attendance"`
	WorkLogs           []WorkLog           `json:"work_logs"`
	Lessons            []Lesson            `json:"lessons"`
	Todos              []Todo              `json:"todos"`
	Checklists         []Checklist         `json:"checklists"`
	ChecklistSnapshots []ChecklistSnapshot `json:"checklist_snapshots"`
	UserSettings       map[string]string   `json:"user_settings"`
	IterationOverrides []IterationOverride `json:"iteration_overrides"`
	ExportedAt         string              `json:"exported_at"`
}
