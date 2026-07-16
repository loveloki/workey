package app

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"time"
)

const (
	checklistKindManual       = "manual"
	checklistKindDailyStart   = "daily_start"
	checklistKindIterationEnd = "iteration_end"
)

var reminderChecklistDefaults = []struct {
	Kind  string
	Title string
	Items string
}{
	{
		Kind:  checklistKindDailyStart,
		Title: "每日上班检查",
		Items: `[{"text":"查看待处理事项，确认今日优先级"},{"text":"检查工单与消息，识别紧急事项"},{"text":"确认今日会议与日程安排"},{"text":"更新看板任务状态与今日计划"}]`,
	},
	{
		Kind:  checklistKindIterationEnd,
		Title: "Iteration 结束检查",
		Items: `[{"text":"确认本迭代待办已完成或明确顺延"},{"text":"更新看板中所有任务的最终状态"},{"text":"补齐工作日志与已完成事项"},{"text":"复查工单问题记录与原因归类"},{"text":"核对上线、变更与遗留风险"},{"text":"整理本迭代成果与改进项"},{"text":"规划下一 Iteration 的目标和优先级"}]`,
	},
}

func ensureReminderChecklists(userID int64) error {
	now := nowDatetime()
	for _, item := range reminderChecklistDefaults {
		_, err := db.Exec(`INSERT OR IGNORE INTO checklists (user_id, title, items, kind, created_at, updated_at)
			SELECT ?, ?, ?, ?, ?, ?
			WHERE NOT EXISTS (SELECT 1 FROM checklists WHERE user_id = ? AND kind = ?)`,
			userID, item.Title, item.Items, item.Kind, now, now, userID, item.Kind)
		if err != nil {
			return err
		}
	}
	return nil
}

func handleChecklistReminders(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	date := r.URL.Query().Get("date")
	if _, err := time.Parse(dateFormat, date); err != nil {
		jsonError(w, "date must be in YYYY-MM-DD format", http.StatusBadRequest)
		return
	}

	userID := getUserID(r)
	var clockIn *string
	var status string
	err := db.QueryRow("SELECT clock_in, status FROM attendance WHERE user_id = ? AND date = ?", userID, date).Scan(&clockIn, &status)
	if err == sql.ErrNoRows || clockIn == nil || status == "leave" {
		jsonOK(w, ChecklistReminderListResponse{Reminders: []ChecklistReminder{}})
		return
	}
	if err != nil {
		jsonError(w, "Failed to load attendance", http.StatusInternalServerError)
		return
	}

	if err := ensureReminderChecklists(userID); err != nil {
		jsonError(w, "Failed to initialize reminder checklists", http.StatusInternalServerError)
		return
	}

	reminders := []ChecklistReminder{}
	daily, err := getChecklistByKind(userID, checklistKindDailyStart)
	if err != nil {
		jsonError(w, "Failed to load daily checklist", http.StatusInternalServerError)
		return
	}
	reminders = append(reminders, ChecklistReminder{
		Kind:          checklistKindDailyStart,
		OccurrenceKey: date,
		Label:         "上班后完成",
		DueDate:       date,
		Checklist:     daily,
		Run:           getChecklistRun(userID, checklistKindDailyStart, date),
	})

	iterationNumber, iterationStart, iterationEnd, err := iterationRangeForDate(userID, date)
	if err != nil {
		jsonError(w, "Failed to calculate iteration", http.StatusInternalServerError)
		return
	}
	targetDate, _ := time.Parse(dateFormat, date)
	endDate, _ := time.Parse(dateFormat, iterationEnd)
	daysUntilEnd := int(endDate.Sub(targetDate).Hours() / 24)
	// 默认 14 天的 Iteration 往往在周日结束，提前三天展示可确保工作日能够完成收尾。
	if daysUntilEnd >= 0 && daysUntilEnd <= 2 {
		iterationChecklist, loadErr := getChecklistByKind(userID, checklistKindIterationEnd)
		if loadErr != nil {
			jsonError(w, "Failed to load iteration checklist", http.StatusInternalServerError)
			return
		}
		occurrenceKey := strconv.FormatInt(iterationNumber, 10)
		iterationCopy := iterationNumber
		reminders = append(reminders, ChecklistReminder{
			Kind:            checklistKindIterationEnd,
			OccurrenceKey:   occurrenceKey,
			Label:           "Iteration 收尾阶段",
			DueDate:         date,
			IterationNumber: &iterationCopy,
			IterationStart:  iterationStart,
			IterationEnd:    iterationEnd,
			Checklist:       iterationChecklist,
			Run:             getChecklistRun(userID, checklistKindIterationEnd, occurrenceKey),
		})
	}

	jsonOK(w, ChecklistReminderListResponse{Reminders: reminders})
}

func handleChecklistRuns(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut && r.Method != http.MethodPost {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		ChecklistID   int64    `json:"checklist_id"`
		Kind          string   `json:"kind"`
		OccurrenceKey string   `json:"occurrence_key"`
		Checked       []bool   `json:"checked"`
		Notes         []string `json:"notes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if req.Kind != checklistKindDailyStart && req.Kind != checklistKindIterationEnd {
		jsonError(w, "Invalid checklist kind", http.StatusBadRequest)
		return
	}
	if req.ChecklistID < 1 || req.OccurrenceKey == "" {
		jsonError(w, "checklist_id and occurrence_key are required", http.StatusBadRequest)
		return
	}

	userID := getUserID(r)
	var checklist Checklist
	err := db.QueryRow(`SELECT id, user_id, title, items, kind, created_at, updated_at
		FROM checklists WHERE id = ? AND user_id = ?`, req.ChecklistID, userID).
		Scan(&checklist.ID, &checklist.UserID, &checklist.Title, &checklist.Items, &checklist.Kind, &checklist.CreatedAt, &checklist.UpdatedAt)
	if err != nil || checklist.Kind != req.Kind {
		jsonError(w, "Checklist not found", http.StatusNotFound)
		return
	}

	var items []json.RawMessage
	if err := json.Unmarshal([]byte(checklist.Items), &items); err != nil {
		jsonError(w, "Checklist items are invalid", http.StatusInternalServerError)
		return
	}
	if len(req.Checked) != len(items) || len(req.Notes) != len(items) {
		jsonError(w, "checked and notes must match checklist item count", http.StatusBadRequest)
		return
	}

	var iterationNumber *int64
	if req.Kind == checklistKindDailyStart {
		if _, err := time.Parse(dateFormat, req.OccurrenceKey); err != nil {
			jsonError(w, "Invalid daily occurrence_key", http.StatusBadRequest)
			return
		}
	} else {
		number, err := strconv.ParseInt(req.OccurrenceKey, 10, 64)
		if err != nil || number < 1 {
			jsonError(w, "Invalid iteration occurrence_key", http.StatusBadRequest)
			return
		}
		iterationNumber = &number
	}

	completed := len(items) > 0
	for _, checked := range req.Checked {
		if !checked {
			completed = false
			break
		}
	}
	data, _ := json.Marshal(struct {
		Checked []bool   `json:"checked"`
		Notes   []string `json:"notes"`
	}{Checked: req.Checked, Notes: req.Notes})
	now := nowDatetime()
	var completedAt *string
	if completed {
		completedAt = &now
	}
	completedInt := 0
	if completed {
		completedInt = 1
	}

	_, err = db.Exec(`INSERT INTO checklist_runs (
		user_id, checklist_id, kind, occurrence_key, iteration_number, title, items, data,
		completed, completed_at, created_at, updated_at
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	ON CONFLICT(user_id, kind, occurrence_key) DO UPDATE SET
		checklist_id = excluded.checklist_id,
		iteration_number = excluded.iteration_number,
		title = excluded.title,
		items = excluded.items,
		data = excluded.data,
		completed = excluded.completed,
		completed_at = excluded.completed_at,
		updated_at = excluded.updated_at`,
		userID, checklist.ID, req.Kind, req.OccurrenceKey, iterationNumber, checklist.Title,
		checklist.Items, string(data), completedInt, completedAt, now, now)
	if err != nil {
		jsonError(w, "Failed to save checklist progress", http.StatusInternalServerError)
		return
	}

	run := getChecklistRun(userID, req.Kind, req.OccurrenceKey)
	if run == nil {
		jsonError(w, "Failed to load checklist progress", http.StatusInternalServerError)
		return
	}
	jsonOK(w, ChecklistRunResponse{Run: *run})
}

func getChecklistByKind(userID int64, kind string) (Checklist, error) {
	var checklist Checklist
	err := db.QueryRow(`SELECT id, user_id, title, items, kind, created_at, updated_at
		FROM checklists WHERE user_id = ? AND kind = ?`, userID, kind).
		Scan(&checklist.ID, &checklist.UserID, &checklist.Title, &checklist.Items, &checklist.Kind, &checklist.CreatedAt, &checklist.UpdatedAt)
	return checklist, err
}

func getChecklistRun(userID int64, kind, occurrenceKey string) *ChecklistRun {
	var run ChecklistRun
	var completed int
	err := db.QueryRow(`SELECT id, user_id, checklist_id, kind, occurrence_key, iteration_number,
		title, items, data, completed, completed_at, created_at, updated_at
		FROM checklist_runs WHERE user_id = ? AND kind = ? AND occurrence_key = ?`,
		userID, kind, occurrenceKey).
		Scan(&run.ID, &run.UserID, &run.ChecklistID, &run.Kind, &run.OccurrenceKey,
			&run.IterationNumber, &run.Title, &run.Items, &run.Data, &completed,
			&run.CompletedAt, &run.CreatedAt, &run.UpdatedAt)
	if err != nil {
		return nil
	}
	run.Completed = completed != 0
	return &run
}
