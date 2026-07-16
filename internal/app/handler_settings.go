package app

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"
)

// 用户设置 handler

func handleSettings(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case "GET":
		handleGetSettings(w, r)
	case "POST":
		handlePostSettings(w, r)
	default:
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func defaultSettings() map[string]string {
	return map[string]string{
		"timezone":                "+8",
		"kanban_url":              "https://www.fizzy.do/",
		"theme":                   "light",
		"iteration_start_date":    "2019-09-02",
		"iteration_duration_days": "14",
		"iteration_workdays":      "10",
		"reminder_delay":          "9",
	}
}

func loadSettings(userID int64) (map[string]string, error) {
	values := defaultSettings()
	rows, err := db.Query("SELECT key, value FROM user_settings WHERE user_id = ?", userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	hasWorkdays := false
	for rows.Next() {
		var key, value string
		if err := rows.Scan(&key, &value); err != nil {
			return nil, err
		}
		values[key] = value
		if key == "iteration_workdays" {
			hasWorkdays = true
		}
	}
	if !hasWorkdays {
		if days, parseErr := strconv.Atoi(values["iteration_duration_days"]); parseErr == nil && days > 0 {
			workdays := (days*5 + 3) / 7
			if workdays < 1 {
				workdays = 1
			}
			values["iteration_workdays"] = strconv.Itoa(workdays)
		}
	}
	return values, rows.Err()
}

func settingsResponse(values map[string]string) SettingsResponse {
	return SettingsResponse{
		Timezone:              values["timezone"],
		KanbanURL:             values["kanban_url"],
		Theme:                 values["theme"],
		IterationStartDate:    values["iteration_start_date"],
		IterationDurationDays: values["iteration_duration_days"],
		IterationWorkdays:     values["iteration_workdays"],
		ReminderDelay:         values["reminder_delay"],
	}
}

func handleGetSettings(w http.ResponseWriter, r *http.Request) {
	values, err := loadSettings(getUserID(r))
	if err != nil {
		jsonError(w, "Internal error", http.StatusInternalServerError)
		return
	}
	jsonOK(w, settingsResponse(values))
}

func handlePostSettings(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	var req SettingsUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.IterationStartDate != "" {
		if _, err := time.Parse(dateFormat, req.IterationStartDate); err != nil {
			jsonError(w, "iteration_start_date must be in YYYY-MM-DD format", http.StatusBadRequest)
			return
		}
	}
	if req.IterationWorkdays != "" {
		workdays, err := strconv.Atoi(req.IterationWorkdays)
		if err != nil || workdays < 1 || workdays > 100 {
			jsonError(w, "iteration_workdays must be between 1 and 100", http.StatusBadRequest)
			return
		}
	}

	// 旧客户端仍可提交自然日周期，按每周 5 个工作日换算。
	if req.IterationWorkdays == "" && req.IterationDurationDays != "" {
		days, err := strconv.Atoi(req.IterationDurationDays)
		if err != nil || days < 1 {
			jsonError(w, "iteration_duration_days must be a positive integer", http.StatusBadRequest)
			return
		}
		workdays := (days*5 + 3) / 7
		if workdays < 1 {
			workdays = 1
		}
		req.IterationWorkdays = strconv.Itoa(workdays)
	}

	settingsToSave := map[string]string{
		"timezone":                req.Timezone,
		"kanban_url":              req.KanbanURL,
		"theme":                   req.Theme,
		"iteration_start_date":    req.IterationStartDate,
		"iteration_duration_days": req.IterationDurationDays,
		"iteration_workdays":      req.IterationWorkdays,
		"reminder_delay":          req.ReminderDelay,
	}
	for key, value := range settingsToSave {
		if value == "" {
			continue
		}
		if _, err := db.Exec(`INSERT INTO user_settings (user_id, key, value) VALUES (?, ?, ?)
			ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value`, userID, key, value); err != nil {
			jsonError(w, "Failed to save settings", http.StatusInternalServerError)
			return
		}
	}

	values, err := loadSettings(userID)
	if err != nil {
		jsonError(w, "Internal error", http.StatusInternalServerError)
		return
	}
	jsonOK(w, settingsResponse(values))
}
