package main

import (
	"encoding/json"
	"net/http"
)

// 工作日志 handler

func handleWorkLogs(w http.ResponseWriter, r *http.Request) {
	if r.Method == "POST" {
		handleWorkLogCreate(w, r)
		return
	}
	jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
}

func handleWorkLogCreate(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)

	var req struct {
		Date    string `json:"date"`
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Date == "" {
		req.Date = today()
	}

	now := nowDatetime()

	result, err := db.Exec(
		"UPDATE work_logs SET content = ?, updated_at = ? WHERE user_id = ? AND date = ?",
		req.Content, now, userID, req.Date,
	)
	if err != nil {
		jsonError(w, "Internal error", http.StatusInternalServerError)
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		_, err = db.Exec(
			"INSERT INTO work_logs (user_id, date, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
			userID, req.Date, req.Content, now, now,
		)
		if err != nil {
			jsonError(w, "Internal error", http.StatusInternalServerError)
			return
		}
	}

	workLog := getWorkLog(userID, req.Date)
	jsonOK(w, WorkLogResponse{WorkLog: workLog})
}

func handleWorkLogToday(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserID(r)
	workLog := getWorkLog(userID, today())
	if workLog == nil {
		jsonOK(w, WorkLogResponse{})
		return
	}
	jsonOK(w, WorkLogResponse{WorkLog: workLog})
}

func handleWorkLogRange(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserID(r)
	start := r.URL.Query().Get("start")
	end := r.URL.Query().Get("end")
	if start == "" || end == "" {
		jsonError(w, "start and end query parameters are required", http.StatusBadRequest)
		return
	}

	rows, err := db.Query(
		"SELECT id, user_id, date, content, created_at, updated_at FROM work_logs WHERE user_id = ? AND date >= ? AND date <= ? ORDER BY date",
		userID, start, end,
	)
	if err != nil {
		jsonError(w, "Internal error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	logs := []WorkLog{}
	for rows.Next() {
		var wl WorkLog
		rows.Scan(&wl.ID, &wl.UserID, &wl.Date, &wl.Content, &wl.CreatedAt, &wl.UpdatedAt)
		logs = append(logs, wl)
	}
	jsonOK(w, WorkLogListResponse{WorkLogs: logs})
}

func getWorkLog(userID int64, date string) *WorkLog {
	var wl WorkLog
	err := db.QueryRow(
		"SELECT id, user_id, date, content, created_at, updated_at FROM work_logs WHERE user_id = ? AND date = ?",
		userID, date,
	).Scan(&wl.ID, &wl.UserID, &wl.Date, &wl.Content, &wl.CreatedAt, &wl.UpdatedAt)
	if err != nil {
		return nil
	}
	return &wl
}
