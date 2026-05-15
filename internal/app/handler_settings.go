package app

import (
	"database/sql"
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

	var timezone string
	err := db.QueryRow("SELECT value FROM user_settings WHERE user_id = ? AND key = 'timezone'", userID).Scan(&timezone)
	if err == sql.ErrNoRows {
		timezone = "+8"
	} else if err != nil {
		jsonError(w, "Internal error", http.StatusInternalServerError)
		return
	}

	var kanbanURL string
	err = db.QueryRow("SELECT value FROM user_settings WHERE user_id = ? AND key = 'kanban_url'", userID).Scan(&kanbanURL)
	if err == sql.ErrNoRows {
		kanbanURL = "https://www.fizzy.do/"
	} else if err != nil {
		jsonError(w, "Internal error", http.StatusInternalServerError)
		return
	}

	var theme string
	err = db.QueryRow("SELECT value FROM user_settings WHERE user_id = ? AND key = 'theme'", userID).Scan(&theme)
	if err == sql.ErrNoRows {
		theme = "light"
	} else if err != nil {
		jsonError(w, "Internal error", http.StatusInternalServerError)
		return
	}

	var iterationStartDate string
	err = db.QueryRow("SELECT value FROM user_settings WHERE user_id = ? AND key = 'iteration_start_date'", userID).Scan(&iterationStartDate)
	if err == sql.ErrNoRows {
		iterationStartDate = "2019-09-02"
	} else if err != nil {
		jsonError(w, "Internal error", http.StatusInternalServerError)
		return
	}

	var iterationDurationDays string
	err = db.QueryRow("SELECT value FROM user_settings WHERE user_id = ? AND key = 'iteration_duration_days'", userID).Scan(&iterationDurationDays)
	if err == sql.ErrNoRows {
		iterationDurationDays = "14"
	} else if err != nil {
		jsonError(w, "Internal error", http.StatusInternalServerError)
		return
	}

	jsonOK(w, SettingsResponse{
		Timezone:              timezone,
		KanbanURL:             kanbanURL,
		Theme:                 theme,
		IterationStartDate:    iterationStartDate,
		IterationDurationDays: iterationDurationDays,
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
