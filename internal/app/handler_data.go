package app

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// 数据导出/导入/删除 handler

func handleDataExport(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserID(r)

	attendances := []Attendance{}
	rows, err := db.Query(
		"SELECT id, user_id, date, clock_in, clock_out, status, is_overtime, created_at, updated_at FROM attendance WHERE user_id = ? ORDER BY date",
		userID,
	)
	if err != nil {
		jsonError(w, "Failed to export attendance", http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var a Attendance
		var ov int
		rows.Scan(&a.ID, &a.UserID, &a.Date, &a.ClockIn, &a.ClockOut, &a.Status, &ov, &a.CreatedAt, &a.UpdatedAt)
		a.IsOvertime = ov == 1
		attendances = append(attendances, a)
	}

	workLogsList := []WorkLog{}
	rows, err = db.Query(
		"SELECT id, user_id, date, content, created_at, updated_at FROM work_logs WHERE user_id = ? ORDER BY date",
		userID,
	)
	if err != nil {
		jsonError(w, "Failed to export work logs", http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var wl WorkLog
		rows.Scan(&wl.ID, &wl.UserID, &wl.Date, &wl.Content, &wl.CreatedAt, &wl.UpdatedAt)
		workLogsList = append(workLogsList, wl)
	}

	todosList := []Todo{}
	rows, err = db.Query(
		"SELECT id, user_id, content, url, done, created_at, updated_at FROM todos WHERE user_id = ? ORDER BY id",
		userID,
	)
	if err != nil {
		jsonError(w, "Failed to export todos", http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var t Todo
		var done int
		rows.Scan(&t.ID, &t.UserID, &t.Content, &t.URL, &done, &t.CreatedAt, &t.UpdatedAt)
		t.Done = done != 0
		todosList = append(todosList, t)
	}

	ticketIssuesList := []TicketIssue{}
	rows, err = db.Query(`
		SELECT id, user_id, ticket_no, ticket_title, ticket_url, occurred_on, cause_type,
			problem_description, cause_detail, resolution, created_at, updated_at
		FROM ticket_issues WHERE user_id = ? ORDER BY occurred_on, id`, userID)
	if err != nil {
		jsonError(w, "Failed to export ticket issues", http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	for rows.Next() {
		issue, scanErr := scanTicketIssue(rows)
		if scanErr != nil {
			jsonError(w, "Failed to export ticket issues", http.StatusInternalServerError)
			return
		}
		ticketIssuesList = append(ticketIssuesList, issue)
	}

	checklistsList := []Checklist{}
	rows, err = db.Query(
		"SELECT id, user_id, title, items, kind, created_at, updated_at FROM checklists WHERE user_id = ? ORDER BY id",
		userID,
	)
	if err != nil {
		jsonError(w, "Failed to export checklists", http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var c Checklist
		rows.Scan(&c.ID, &c.UserID, &c.Title, &c.Items, &c.Kind, &c.CreatedAt, &c.UpdatedAt)
		checklistsList = append(checklistsList, c)
	}

	checklistRunsList := []ChecklistRun{}
	rows, err = db.Query(`SELECT id, user_id, checklist_id, kind, occurrence_key, iteration_number,
		title, items, data, completed, completed_at, created_at, updated_at
		FROM checklist_runs WHERE user_id = ? ORDER BY id`, userID)
	if err != nil {
		jsonError(w, "Failed to export checklist runs", http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var run ChecklistRun
		var completed int
		rows.Scan(&run.ID, &run.UserID, &run.ChecklistID, &run.Kind, &run.OccurrenceKey,
			&run.IterationNumber, &run.Title, &run.Items, &run.Data, &completed,
			&run.CompletedAt, &run.CreatedAt, &run.UpdatedAt)
		run.Completed = completed != 0
		checklistRunsList = append(checklistRunsList, run)
	}

	snapshotsList := []ChecklistSnapshot{}
	rows, err = db.Query(
		"SELECT id, user_id, checklist_id, title, items_hash, data, created_at FROM checklist_snapshots WHERE user_id = ? ORDER BY id",
		userID,
	)
	if err != nil {
		jsonError(w, "Failed to export checklist snapshots", http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var s ChecklistSnapshot
		rows.Scan(&s.ID, &s.UserID, &s.ChecklistID, &s.Title, &s.ItemsHash, &s.Data, &s.CreatedAt)
		snapshotsList = append(snapshotsList, s)
	}

	userSettings := map[string]string{}
	rows, err = db.Query("SELECT key, value FROM user_settings WHERE user_id = ?", userID)
	if err != nil {
		jsonError(w, "Failed to export user settings", http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var k, v string
		rows.Scan(&k, &v)
		userSettings[k] = v
	}

	overridesList := []IterationOverride{}
	rows, err = db.Query(
		"SELECT id, user_id, iteration_number, start_date, end_date, created_at, updated_at FROM iteration_overrides WHERE user_id = ? ORDER BY iteration_number",
		userID,
	)
	if err != nil {
		jsonError(w, "Failed to export iteration overrides", http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var o IterationOverride
		rows.Scan(&o.ID, &o.UserID, &o.IterationNumber, &o.StartDate, &o.EndDate, &o.CreatedAt, &o.UpdatedAt)
		overridesList = append(overridesList, o)
	}

	calendarDays := []HolidayCalendarDay{}
	rows, err = db.Query(`SELECT id, user_id, date, is_workday, name, source, created_at, updated_at
		FROM holiday_calendar_days WHERE user_id = ? ORDER BY date`, userID)
	if err != nil {
		jsonError(w, "Failed to export holiday calendar", http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var day HolidayCalendarDay
		var isWorkday int
		rows.Scan(&day.ID, &day.UserID, &day.Date, &isWorkday, &day.Name, &day.Source, &day.CreatedAt, &day.UpdatedAt)
		day.IsWorkday = isWorkday != 0
		calendarDays = append(calendarDays, day)
	}

	exportData := ExportData{
		Attendance:         attendances,
		WorkLogs:           workLogsList,
		Todos:              todosList,
		TicketIssues:       ticketIssuesList,
		Checklists:         checklistsList,
		ChecklistRuns:      checklistRunsList,
		ChecklistSnapshots: snapshotsList,
		UserSettings:       userSettings,
		IterationOverrides: overridesList,
		HolidayCalendar:    calendarDays,
		ExportedAt:         time.Now().Format(time.RFC3339),
	}

	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)

	jsonBytes, _ := json.MarshalIndent(exportData, "", "  ")
	fw, _ := zw.Create("data.json")
	fw.Write(jsonBytes)

	zw.Close()

	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition",
		fmt.Sprintf(`attachment; filename="workey-export-%s.zip"`, time.Now().Format("2006-01-02")))
	w.Write(buf.Bytes())
}

func handleDataImport(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserID(r)

	if err := r.ParseMultipartForm(50 << 20); err != nil {
		jsonError(w, "File too large (max 50MB)", http.StatusBadRequest)
		return
	}
	file, _, err := r.FormFile("file")
	if err != nil {
		jsonError(w, "No file provided", http.StatusBadRequest)
		return
	}
	defer file.Close()

	zipBytes, err := io.ReadAll(file)
	if err != nil {
		jsonError(w, "Failed to read file", http.StatusBadRequest)
		return
	}

	zr, err := zip.NewReader(bytes.NewReader(zipBytes), int64(len(zipBytes)))
	if err != nil {
		jsonError(w, "Invalid zip file", http.StatusBadRequest)
		return
	}

	var importData struct {
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
	}
	foundJSON := false

	for _, f := range zr.File {
		if f.Name == "data.json" {
			rc, err := f.Open()
			if err != nil {
				jsonError(w, "Failed to read data.json", http.StatusBadRequest)
				return
			}
			if err := json.NewDecoder(rc).Decode(&importData); err != nil {
				rc.Close()
				jsonError(w, "Invalid data.json format", http.StatusBadRequest)
				return
			}
			rc.Close()
			foundJSON = true
		}
	}

	if !foundJSON {
		jsonError(w, "data.json not found in zip", http.StatusBadRequest)
		return
	}

	attendanceCount := 0
	workLogCount := 0

	for _, a := range importData.Attendance {
		if a.Date == "" {
			continue
		}
		now := nowDatetime()
		status := a.Status
		if status == "" {
			status = "normal"
		}
		overtime := 0
		if a.IsOvertime {
			overtime = 1
		}
		result, err := db.Exec(
			"UPDATE attendance SET clock_in = ?, clock_out = ?, status = ?, is_overtime = ?, updated_at = ? WHERE user_id = ? AND date = ?",
			a.ClockIn, a.ClockOut, status, overtime, now, userID, a.Date,
		)
		if err != nil {
			continue
		}

		rowsAffected, _ := result.RowsAffected()
		if rowsAffected == 0 {
			_, err = db.Exec(
				"INSERT INTO attendance (user_id, date, clock_in, clock_out, status, is_overtime, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
				userID, a.Date, a.ClockIn, a.ClockOut, status, overtime, now, now,
			)
			if err != nil {
				continue
			}
		}
		attendanceCount++
	}

	for _, wl := range importData.WorkLogs {
		if wl.Date == "" {
			continue
		}
		now := nowDatetime()
		result, err := db.Exec(
			"UPDATE work_logs SET content = ?, updated_at = ? WHERE user_id = ? AND date = ?",
			wl.Content, now, userID, wl.Date,
		)
		if err != nil {
			continue
		}
		rowsAffected, _ := result.RowsAffected()
		if rowsAffected == 0 {
			_, err = db.Exec(
				"INSERT INTO work_logs (user_id, date, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
				userID, wl.Date, wl.Content, now, now,
			)
			if err != nil {
				continue
			}
		}
		workLogCount++
	}

	checklistIDMap := map[int64]int64{}
	checklistCount := 0
	for _, c := range importData.Checklists {
		if strings.TrimSpace(c.Title) == "" {
			continue
		}
		items := c.Items
		if items == "" {
			items = "[]"
		}
		now := nowDatetime()
		kind := c.Kind
		if kind != checklistKindDailyStart && kind != checklistKindIterationEnd {
			kind = checklistKindManual
		}
		var existingID int64
		var err error
		if kind == checklistKindManual {
			err = db.QueryRow("SELECT id FROM checklists WHERE user_id = ? AND kind = 'manual' AND title = ?", userID, c.Title).Scan(&existingID)
		} else {
			err = db.QueryRow("SELECT id FROM checklists WHERE user_id = ? AND kind = ?", userID, kind).Scan(&existingID)
		}
		if err == nil {
			_, err = db.Exec("UPDATE checklists SET title = ?, items = ?, updated_at = ? WHERE id = ? AND user_id = ?",
				c.Title, items, now, existingID, userID)
			if err == nil {
				checklistIDMap[c.ID] = existingID
				checklistCount++
			}
		} else {
			result, insertErr := db.Exec(
				"INSERT INTO checklists (user_id, title, items, kind, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
				userID, c.Title, items, kind, now, now,
			)
			if insertErr == nil {
				newID, _ := result.LastInsertId()
				checklistIDMap[c.ID] = newID
				checklistCount++
			}
		}
	}

	checklistRunCount := 0
	for _, run := range importData.ChecklistRuns {
		newID, ok := checklistIDMap[run.ChecklistID]
		if !ok || run.OccurrenceKey == "" {
			continue
		}
		kind := run.Kind
		if kind != checklistKindDailyStart && kind != checklistKindIterationEnd {
			continue
		}
		data := run.Data
		if data == "" {
			data = "{}"
		}
		createdAt := run.CreatedAt
		if createdAt == "" {
			createdAt = nowDatetime()
		}
		updatedAt := run.UpdatedAt
		if updatedAt == "" {
			updatedAt = createdAt
		}
		completed := 0
		if run.Completed {
			completed = 1
		}
		_, err := db.Exec(`INSERT INTO checklist_runs (
			user_id, checklist_id, kind, occurrence_key, iteration_number, title, items, data,
			completed, completed_at, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(user_id, kind, occurrence_key) DO UPDATE SET
			checklist_id = excluded.checklist_id, title = excluded.title, items = excluded.items,
			data = excluded.data, completed = excluded.completed, completed_at = excluded.completed_at,
			updated_at = excluded.updated_at`,
			userID, newID, kind, run.OccurrenceKey, run.IterationNumber, run.Title, run.Items,
			data, completed, run.CompletedAt, createdAt, updatedAt)
		if err == nil {
			checklistRunCount++
		}
	}

	snapshotCount := 0
	for _, s := range importData.ChecklistSnapshots {
		newID, ok := checklistIDMap[s.ChecklistID]
		if !ok {
			continue
		}
		data := s.Data
		if data == "" {
			data = "{}"
		}
		created := s.CreatedAt
		if created == "" {
			created = nowDatetime()
		}
		_, err := db.Exec(
			"INSERT INTO checklist_snapshots (user_id, checklist_id, title, items_hash, data, created_at) VALUES (?, ?, ?, ?, ?, ?)",
			userID, newID, s.Title, s.ItemsHash, data, created,
		)
		if err == nil {
			snapshotCount++
		}
	}

	// 导入待办事项（按 content+url 去重，update or insert）
	todoCount := 0
	for _, t := range importData.Todos {
		if strings.TrimSpace(t.Content) == "" && strings.TrimSpace(t.URL) == "" {
			continue
		}
		now := nowDatetime()
		doneInt := 0
		if t.Done {
			doneInt = 1
		}
		_, err := db.Exec(
			"INSERT INTO todos (user_id, content, url, done, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
			userID, t.Content, t.URL, doneInt, now, now,
		)
		if err == nil {
			todoCount++
		}
	}

	// 导入工单问题记录。
	ticketIssueCount := 0
	for _, issue := range importData.TicketIssues {
		req := ticketIssueRequest{
			TicketNo: issue.TicketNo, TicketTitle: issue.TicketTitle, TicketURL: issue.TicketURL,
			OccurredOn: issue.OccurredOn, CauseType: issue.CauseType,
			ProblemDescription: issue.ProblemDescription, CauseDetail: issue.CauseDetail,
			Resolution: issue.Resolution,
		}
		if validateTicketIssueRequest(&req) != "" {
			continue
		}
		createdAt := issue.CreatedAt
		if createdAt == "" {
			createdAt = nowDatetime()
		}
		updatedAt := issue.UpdatedAt
		if updatedAt == "" {
			updatedAt = createdAt
		}
		_, err := db.Exec(`
			INSERT INTO ticket_issues (
				user_id, ticket_no, ticket_title, ticket_url, occurred_on, cause_type,
				problem_description, cause_detail, resolution, created_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			userID, req.TicketNo, req.TicketTitle, req.TicketURL, req.OccurredOn,
			req.CauseType, req.ProblemDescription, req.CauseDetail, req.Resolution, createdAt, updatedAt,
		)
		if err == nil {
			ticketIssueCount++
		}
	}

	// 导入用户设置
	for key, value := range importData.UserSettings {
		if value == "" {
			continue
		}
		db.Exec(
			"INSERT INTO user_settings (user_id, key, value) VALUES (?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value",
			userID, key, value,
		)
	}

	// 导入迭代周期覆盖
	overrideCount := 0
	for _, o := range importData.IterationOverrides {
		if o.StartDate == "" || o.EndDate == "" {
			continue
		}
		now := nowDatetime()
		result, err := db.Exec(
			"UPDATE iteration_overrides SET start_date = ?, end_date = ?, updated_at = ? WHERE user_id = ? AND iteration_number = ?",
			o.StartDate, o.EndDate, now, userID, o.IterationNumber,
		)
		if err != nil {
			continue
		}
		rowsAffected, _ := result.RowsAffected()
		if rowsAffected == 0 {
			_, err = db.Exec(
				"INSERT INTO iteration_overrides (user_id, iteration_number, start_date, end_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
				userID, o.IterationNumber, o.StartDate, o.EndDate, now, now,
			)
			if err != nil {
				continue
			}
		}
		overrideCount++
	}

	calendarDayCount := 0
	for _, day := range importData.HolidayCalendar {
		if _, err := time.Parse(dateFormat, day.Date); err != nil {
			continue
		}
		isWorkday := 0
		if day.IsWorkday {
			isWorkday = 1
		}
		now := nowDatetime()
		_, err := db.Exec(`INSERT INTO holiday_calendar_days
			(user_id, date, is_workday, name, source, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(user_id, date) DO UPDATE SET
				is_workday = excluded.is_workday, name = excluded.name,
				source = excluded.source, updated_at = excluded.updated_at`,
			userID, day.Date, isWorkday, day.Name, day.Source, now, now)
		if err == nil {
			calendarDayCount++
		}
	}

	jsonOK(w, DataImportResponse{
		Message:           "Data imported successfully",
		AttendanceCount:   attendanceCount,
		WorkLogCount:      workLogCount,
		TodoCount:         todoCount,
		TicketIssueCount:  ticketIssueCount,
		ChecklistCount:    checklistCount,
		ChecklistRunCount: checklistRunCount,
		SnapshotCount:     snapshotCount,
		OverrideCount:     overrideCount,
		CalendarDayCount:  calendarDayCount,
	})
}

func handleDataDelete(w http.ResponseWriter, r *http.Request) {
	if r.Method != "DELETE" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserID(r)

	var req struct {
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Password == "" {
		jsonError(w, "Password is required to delete data", http.StatusBadRequest)
		return
	}

	var passwordHash string
	err := db.QueryRow("SELECT password_hash FROM users WHERE id = ?", userID).Scan(&passwordHash)
	if err != nil {
		jsonError(w, "User not found", http.StatusNotFound)
		return
	}

	if !checkPassword(req.Password, passwordHash) {
		jsonError(w, "Password is incorrect", http.StatusUnauthorized)
		return
	}

	tables := []string{"attendance", "work_logs", "todos", "ticket_issues", "checklist_runs", "checklist_snapshots", "checklists", "iteration_overrides", "holiday_calendar_days"}
	counts := map[string]int64{}
	for _, table := range tables {
		result, err := db.Exec("DELETE FROM "+table+" WHERE user_id = ?", userID)
		if err != nil {
			jsonError(w, "Failed to delete "+table, http.StatusInternalServerError)
			return
		}
		n, _ := result.RowsAffected()
		counts[table] = n
	}

	jsonOK(w, DataDeleteResponse{
		Message:          "All data deleted successfully",
		AttendanceCount:  counts["attendance"],
		WorkLogCount:     counts["work_logs"],
		TodoCount:        counts["todos"],
		TicketIssueCount: counts["ticket_issues"],
	})
}
