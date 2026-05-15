package app

import (
	"encoding/json"
	"net/http"
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

func handleGetSettings(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)

	// 默认值
	values := map[string]string{
		"timezone":                "+8",
		"kanban_url":              "https://www.fizzy.do/",
		"theme":                   "light",
		"iteration_start_date":    "2019-09-02",
		"iteration_duration_days": "14",
	}

	// 一次查询获取所有设置
	rows, err := db.Query("SELECT key, value FROM user_settings WHERE user_id = ?", userID)
	if err != nil {
		jsonError(w, "Internal error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var key, value string
		if err := rows.Scan(&key, &value); err == nil {
			values[key] = value
		}
	}

	jsonOK(w, SettingsResponse{
		Timezone:              values["timezone"],
		KanbanURL:             values["kanban_url"],
		Theme:                 values["theme"],
		IterationStartDate:    values["iteration_start_date"],
		IterationDurationDays: values["iteration_duration_days"],
	})
}

func handlePostSettings(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)

	var req struct {
		Timezone              string `json:"timezone"`
		KanbanURL             string `json:"kanban_url"`
		Theme                 string `json:"theme"`
		IterationStartDate    string `json:"iteration_start_date"`
		IterationDurationDays string `json:"iteration_duration_days"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	settingsToSave := map[string]string{
		"timezone":                req.Timezone,
		"kanban_url":              req.KanbanURL,
		"theme":                   req.Theme,
		"iteration_start_date":    req.IterationStartDate,
		"iteration_duration_days": req.IterationDurationDays,
	}

	for key, value := range settingsToSave {
		if value == "" {
			continue
		}
		_, err := db.Exec(
			"INSERT INTO user_settings (user_id, key, value) VALUES (?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value",
			userID, key, value,
		)
		if err != nil {
			jsonError(w, "Failed to save settings", http.StatusInternalServerError)
			return
		}
	}

	// 读取当前值作为响应
	defaults := map[string]string{
		"timezone":                "+8",
		"kanban_url":              "https://www.fizzy.do/",
		"theme":                   "light",
		"iteration_start_date":    "2019-09-02",
		"iteration_duration_days": "14",
	}
	var resp SettingsResponse
	for key, defaultVal := range defaults {
		var val string
		err := db.QueryRow("SELECT value FROM user_settings WHERE user_id = ? AND key = ?", userID, key).Scan(&val)
		if err != nil {
			val = defaultVal
		}
		switch key {
		case "timezone":
			resp.Timezone = val
		case "kanban_url":
			resp.KanbanURL = val
		case "theme":
			resp.Theme = val
		case "iteration_start_date":
			resp.IterationStartDate = val
		case "iteration_duration_days":
			resp.IterationDurationDays = val
		}
	}

	jsonOK(w, resp)
}
