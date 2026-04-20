package main

import (
	"archive/zip"
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"time"
)

// --- Types ---

type User struct {
	ID        int64  `json:"id"`
	Username  string `json:"username"`
	CreatedAt string `json:"created_at"`
}

type Attendance struct {
	ID        int64   `json:"id"`
	UserID    int64   `json:"user_id"`
	Date      string  `json:"date"`
	ClockIn   *string `json:"clock_in"`
	ClockOut  *string `json:"clock_out"`
	Status    string  `json:"status"`
	CreatedAt string  `json:"created_at"`
	UpdatedAt string  `json:"updated_at"`
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

type IterationOverride struct {
	ID              int64  `json:"id"`
	UserID          int64  `json:"user_id"`
	IterationNumber int64  `json:"iteration_number"`
	StartDate       string `json:"start_date"`
	EndDate         string `json:"end_date"`
	CreatedAt       string `json:"created_at"`
	UpdatedAt       string `json:"updated_at"`
}

func today() string {
	return time.Now().Format("2006-01-02")
}

func nowDatetime() string {
	return time.Now().Format("2006-01-02 15:04:05")
}

// --- Auth handlers ---

func handleRegister(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	req.Username = strings.TrimSpace(req.Username)
	if req.Username == "" || req.Password == "" {
		jsonError(w, "Username and password are required", http.StatusBadRequest)
		return
	}
	if len(req.Password) < 6 {
		jsonError(w, "Password must be at least 6 characters", http.StatusBadRequest)
		return
	}

	hash, err := hashPassword(req.Password)
	if err != nil {
		jsonError(w, "Internal error", http.StatusInternalServerError)
		return
	}

	result, err := db.Exec("INSERT INTO users (username, password_hash) VALUES (?, ?)", req.Username, hash)
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			jsonError(w, "Username already taken", http.StatusConflict)
			return
		}
		jsonError(w, "Internal error", http.StatusInternalServerError)
		return
	}

	userID, _ := result.LastInsertId()
	token, err := createJWT(userID)
	if err != nil {
		jsonError(w, "Failed to create token", http.StatusInternalServerError)
		return
	}

	var user User
	db.QueryRow("SELECT id, username, created_at FROM users WHERE id = ?", userID).Scan(&user.ID, &user.Username, &user.CreatedAt)

	jsonOK(w, map[string]interface{}{"token": token, "user": user})
}

func handleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	var userID int64
	var passwordHash string
	err := db.QueryRow("SELECT id, password_hash FROM users WHERE username = ?", req.Username).Scan(&userID, &passwordHash)
	if err == sql.ErrNoRows {
		jsonError(w, "Invalid username or password", http.StatusUnauthorized)
		return
	} else if err != nil {
		jsonError(w, "Internal error", http.StatusInternalServerError)
		return
	}

	if !checkPassword(req.Password, passwordHash) {
		jsonError(w, "Invalid username or password", http.StatusUnauthorized)
		return
	}

	token, err := createJWT(userID)
	if err != nil {
		jsonError(w, "Failed to create token", http.StatusInternalServerError)
		return
	}

	var user User
	db.QueryRow("SELECT id, username, created_at FROM users WHERE id = ?", userID).Scan(&user.ID, &user.Username, &user.CreatedAt)

	jsonOK(w, map[string]interface{}{"token": token, "user": user})
}

func handleMe(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserID(r)
	var user User
	err := db.QueryRow("SELECT id, username, created_at FROM users WHERE id = ?", userID).Scan(&user.ID, &user.Username, &user.CreatedAt)
	if err != nil {
		jsonError(w, "User not found", http.StatusNotFound)
		return
	}
	jsonOK(w, map[string]interface{}{"user": user})
}

// --- Attendance handlers ---

func handleClockIn(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserID(r)
	date := today()
	now := nowDatetime()

	// Check if record exists for today
	var existingID int64
	var existingClockIn *string
	err := db.QueryRow("SELECT id, clock_in FROM attendance WHERE user_id = ? AND date = ?", userID, date).Scan(&existingID, &existingClockIn)
	
	if err == nil {
		// Record exists
		if existingClockIn != nil {
			jsonError(w, "Already clocked in today", http.StatusConflict)
			return
		}
		// Record exists but clock_in is null (e.g., was on leave). Update it.
		_, err = db.Exec(
			"UPDATE attendance SET clock_in = ?, status = 'normal', updated_at = ? WHERE id = ?",
			now, now, existingID,
		)
		if err != nil {
			jsonError(w, "Failed to clock in", http.StatusInternalServerError)
			return
		}
	} else if err == sql.ErrNoRows {
		// No record, insert new
		_, err = db.Exec(
			"INSERT INTO attendance (user_id, date, clock_in, status, created_at, updated_at) VALUES (?, ?, ?, 'normal', ?, ?)",
			userID, date, now, now, now,
		)
		if err != nil {
			jsonError(w, "Failed to clock in", http.StatusInternalServerError)
			return
		}
	} else {
		jsonError(w, "Database error", http.StatusInternalServerError)
		return
	}

	attendance := getAttendance(userID, date)
	jsonOK(w, attendance)
}

func handleLeave(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserID(r)
	date := today()
	now := nowDatetime()

	var existingID int64
	err := db.QueryRow("SELECT id FROM attendance WHERE user_id = ? AND date = ?", userID, date).Scan(&existingID)

	if err == nil {
		// Update existing record
		_, err = db.Exec(
			"UPDATE attendance SET clock_in = NULL, clock_out = NULL, status = 'leave', updated_at = ? WHERE id = ?",
			now, existingID,
		)
	} else if err == sql.ErrNoRows {
		// Insert new record
		_, err = db.Exec(
			"INSERT INTO attendance (user_id, date, clock_in, clock_out, status, created_at, updated_at) VALUES (?, ?, NULL, NULL, 'leave', ?, ?)",
			userID, date, now, now,
		)
	} else {
		jsonError(w, "Database error", http.StatusInternalServerError)
		return
	}

	if err != nil {
		jsonError(w, "Failed to set leave status", http.StatusInternalServerError)
		return
	}

	attendance := getAttendance(userID, date)
	jsonOK(w, attendance)
}

func handleClockOut(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserID(r)
	date := today()
	now := nowDatetime()

	// Check if clocked in today
	var existingID int64
	err := db.QueryRow("SELECT id FROM attendance WHERE user_id = ? AND date = ?", userID, date).Scan(&existingID)
	if err == sql.ErrNoRows {
		jsonError(w, "Not clocked in today", http.StatusBadRequest)
		return
	}

	_, err = db.Exec(
		"UPDATE attendance SET clock_out = ?, status = 'normal', updated_at = ? WHERE user_id = ? AND date = ?",
		now, now, userID, date,
	)
	if err != nil {
		jsonError(w, "Failed to clock out", http.StatusInternalServerError)
		return
	}

	attendance := getAttendance(userID, date)
	jsonOK(w, attendance)
}

func handleAttendanceToday(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserID(r)
	attendance := getAttendance(userID, today())
	if attendance == nil {
		jsonOK(w, map[string]interface{}{"attendance": nil})
		return
	}
	jsonOK(w, map[string]interface{}{"attendance": attendance})
}

func handleAttendanceStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	userID := getUserID(r)

	var overtimeDays int
	var leaveDays int

	err := db.QueryRow(`
		SELECT 
			COUNT(CASE WHEN status != 'leave' AND (strftime('%w', date) = '0' OR strftime('%w', date) = '6') THEN 1 END) as overtime_days,
			COUNT(CASE WHEN status = 'leave' THEN 1 END) as leave_days
		FROM attendance 
		WHERE user_id = ?
	`, userID).Scan(&overtimeDays, &leaveDays)

	if err != nil {
		jsonError(w, "Failed to calculate stats", http.StatusInternalServerError)
		return
	}

	jsonOK(w, map[string]interface{}{
		"global_overtime_days": overtimeDays,
		"global_leave_days":    leaveDays,
		"global_remaining":     overtimeDays - leaveDays,
	})
}

func handleAttendanceRange(w http.ResponseWriter, r *http.Request) {
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
		"SELECT id, user_id, date, clock_in, clock_out, status, created_at, updated_at FROM attendance WHERE user_id = ? AND date >= ? AND date <= ? ORDER BY date",
		userID, start, end,
	)
	if err != nil {
		jsonError(w, "Internal error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	attendances := []Attendance{}
		for rows.Next() {
			var a Attendance
			rows.Scan(&a.ID, &a.UserID, &a.Date, &a.ClockIn, &a.ClockOut, &a.Status, &a.CreatedAt, &a.UpdatedAt)
			attendances = append(attendances, a)
		}
		jsonOK(w, map[string]interface{}{"attendances": attendances})
}

func getAttendance(userID int64, date string) *Attendance {
	var a Attendance
	err := db.QueryRow(
		"SELECT id, user_id, date, clock_in, clock_out, status, created_at, updated_at FROM attendance WHERE user_id = ? AND date = ?",
		userID, date,
	).Scan(&a.ID, &a.UserID, &a.Date, &a.ClockIn, &a.ClockOut, &a.Status, &a.CreatedAt, &a.UpdatedAt)
	if err != nil {
		return nil
	}
	return &a
}

// --- Work log handlers ---

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

	// Upsert: try update first, then insert
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
	jsonOK(w, map[string]interface{}{"work_log": workLog})
}

func handleWorkLogToday(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserID(r)
	workLog := getWorkLog(userID, today())
	if workLog == nil {
		jsonOK(w, map[string]interface{}{"work_log": nil})
		return
	}
	jsonOK(w, map[string]interface{}{"work_log": workLog})
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
	jsonOK(w, map[string]interface{}{"work_logs": logs})
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

// --- Lesson handlers ---

func handleLessons(w http.ResponseWriter, r *http.Request) {
	if r.Method == "POST" {
		handleLessonCreate(w, r)
		return
	}
	jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
}

func handleLessonCreate(w http.ResponseWriter, r *http.Request) {
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
		"UPDATE lessons SET content = ?, updated_at = ? WHERE user_id = ? AND date = ?",
		req.Content, now, userID, req.Date,
	)
	if err != nil {
		jsonError(w, "Internal error", http.StatusInternalServerError)
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		_, err = db.Exec(
			"INSERT INTO lessons (user_id, date, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
			userID, req.Date, req.Content, now, now,
		)
		if err != nil {
			jsonError(w, "Internal error", http.StatusInternalServerError)
			return
		}
	}

	lesson := getLesson(userID, req.Date)
	jsonOK(w, map[string]interface{}{"lesson": lesson})
}

func handleLessonToday(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserID(r)
	lesson := getLesson(userID, today())
	if lesson == nil {
		jsonOK(w, map[string]interface{}{"lesson": nil})
		return
	}
	jsonOK(w, map[string]interface{}{"lesson": lesson})
}

func handleLessonRange(w http.ResponseWriter, r *http.Request) {
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
		"SELECT id, user_id, date, content, created_at, updated_at FROM lessons WHERE user_id = ? AND date >= ? AND date <= ? ORDER BY date",
		userID, start, end,
	)
	if err != nil {
		jsonError(w, "Internal error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	lessons := []Lesson{}
	for rows.Next() {
		var l Lesson
		rows.Scan(&l.ID, &l.UserID, &l.Date, &l.Content, &l.CreatedAt, &l.UpdatedAt)
		lessons = append(lessons, l)
	}
	jsonOK(w, map[string]interface{}{"lessons": lessons})
}

func getLesson(userID int64, date string) *Lesson {
	var l Lesson
	err := db.QueryRow(
		"SELECT id, user_id, date, content, created_at, updated_at FROM lessons WHERE user_id = ? AND date = ?",
		userID, date,
	).Scan(&l.ID, &l.UserID, &l.Date, &l.Content, &l.CreatedAt, &l.UpdatedAt)
	if err != nil {
		return nil
	}
	return &l
}

// --- Change Password ---

func handleChangePassword(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserID(r)

	var req struct {
		OldPassword string `json:"old_password"`
		NewPassword string `json:"new_password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.OldPassword == "" || req.NewPassword == "" {
		jsonError(w, "Old and new passwords are required", http.StatusBadRequest)
		return
	}

	if len(req.NewPassword) < 6 {
		jsonError(w, "New password must be at least 6 characters", http.StatusBadRequest)
		return
	}

	var currentHash string
	err := db.QueryRow("SELECT password_hash FROM users WHERE id = ?", userID).Scan(&currentHash)
	if err != nil {
		jsonError(w, "User not found", http.StatusNotFound)
		return
	}

	if !checkPassword(req.OldPassword, currentHash) {
		jsonError(w, "Old password is incorrect", http.StatusUnauthorized)
		return
	}

	newHash, err := hashPassword(req.NewPassword)
	if err != nil {
		jsonError(w, "Internal error", http.StatusInternalServerError)
		return
	}

	_, err = db.Exec("UPDATE users SET password_hash = ? WHERE id = ?", newHash, userID)
	if err != nil {
		jsonError(w, "Failed to update password", http.StatusInternalServerError)
		return
	}

	jsonOK(w, map[string]string{"message": "Password changed successfully"})
}

// --- User Settings ---

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

	jsonOK(w, map[string]string{"timezone": timezone, "kanban_url": kanbanURL, "theme": theme, "iteration_start_date": iterationStartDate, "iteration_duration_days": iterationDurationDays})
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

	if req.Timezone != "" {
		_, err := db.Exec(
			"INSERT INTO user_settings (user_id, key, value) VALUES (?, 'timezone', ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value",
			userID, req.Timezone,
		)
		if err != nil {
			jsonError(w, "Failed to save settings", http.StatusInternalServerError)
			return
		}
	}

	if req.KanbanURL != "" {
		_, err := db.Exec(
			"INSERT INTO user_settings (user_id, key, value) VALUES (?, 'kanban_url', ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value",
			userID, req.KanbanURL,
		)
		if err != nil {
			jsonError(w, "Failed to save settings", http.StatusInternalServerError)
			return
		}
	}

	if req.Theme != "" {
		_, err := db.Exec(
			"INSERT INTO user_settings (user_id, key, value) VALUES (?, 'theme', ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value",
			userID, req.Theme,
		)
		if err != nil {
			jsonError(w, "Failed to save settings", http.StatusInternalServerError)
			return
		}
	}

	if req.IterationStartDate != "" {
		_, err := db.Exec(
			"INSERT INTO user_settings (user_id, key, value) VALUES (?, 'iteration_start_date', ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value",
			userID, req.IterationStartDate,
		)
		if err != nil {
			jsonError(w, "Failed to save settings", http.StatusInternalServerError)
			return
		}
	}

	if req.IterationDurationDays != "" {
		_, err := db.Exec(
			"INSERT INTO user_settings (user_id, key, value) VALUES (?, 'iteration_duration_days', ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value",
			userID, req.IterationDurationDays,
		)
		if err != nil {
			jsonError(w, "Failed to save settings", http.StatusInternalServerError)
			return
		}
	}

	// Read current values for response
	var timezone string
	err := db.QueryRow("SELECT value FROM user_settings WHERE user_id = ? AND key = 'timezone'", userID).Scan(&timezone)
	if err != nil {
		timezone = "+8"
	}

	var kanbanURL string
	err = db.QueryRow("SELECT value FROM user_settings WHERE user_id = ? AND key = 'kanban_url'", userID).Scan(&kanbanURL)
	if err != nil {
		kanbanURL = "https://www.fizzy.do/"
	}

	var theme string
	err = db.QueryRow("SELECT value FROM user_settings WHERE user_id = ? AND key = 'theme'", userID).Scan(&theme)
	if err != nil {
		theme = "light"
	}

	var iterationStartDate string
	err = db.QueryRow("SELECT value FROM user_settings WHERE user_id = ? AND key = 'iteration_start_date'", userID).Scan(&iterationStartDate)
	if err != nil {
		iterationStartDate = "2019-09-02"
	}

	var iterationDurationDays string
	err = db.QueryRow("SELECT value FROM user_settings WHERE user_id = ? AND key = 'iteration_duration_days'", userID).Scan(&iterationDurationDays)
	if err != nil {
		iterationDurationDays = "14"
	}

	jsonOK(w, map[string]string{"timezone": timezone, "kanban_url": kanbanURL, "theme": theme, "iteration_start_date": iterationStartDate, "iteration_duration_days": iterationDurationDays})
}

// --- Todo handlers ---

func handleTodos(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case "GET":
		handleGetTodos(w, r)
	case "POST":
		handleCreateTodo(w, r)
	case "PUT":
		handleUpdateTodo(w, r)
	case "DELETE":
		handleDeleteTodo(w, r)
	default:
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func handleCreatedTodayTodos(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserID(r)
	todayStr := today()

	rows, err := db.Query(
		"SELECT id, user_id, content, url, done, created_at, updated_at FROM todos WHERE user_id = ? AND date(created_at) = ? ORDER BY created_at DESC",
		userID, todayStr,
	)
	if err != nil {
		jsonError(w, "Internal error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	todos := []Todo{}
	for rows.Next() {
		var t Todo
		var done int
		rows.Scan(&t.ID, &t.UserID, &t.Content, &t.URL, &done, &t.CreatedAt, &t.UpdatedAt)
		t.Done = done != 0
		todos = append(todos, t)
	}
	jsonOK(w, map[string]interface{}{"todos": todos})
}

func handleCompletedTodayTodos(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserID(r)
	todayStr := today()

	rows, err := db.Query(
		"SELECT id, user_id, content, url, done, created_at, updated_at FROM todos WHERE user_id = ? AND done = 1 AND date(updated_at) = ? ORDER BY updated_at DESC",
		userID, todayStr,
	)
	if err != nil {
		jsonError(w, "Internal error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	todos := []Todo{}
	for rows.Next() {
		var t Todo
		var done int
		rows.Scan(&t.ID, &t.UserID, &t.Content, &t.URL, &done, &t.CreatedAt, &t.UpdatedAt)
		t.Done = done != 0
		todos = append(todos, t)
	}
	jsonOK(w, map[string]interface{}{"todos": todos})
}

func handleCompletedRangeTodos(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserID(r)
	start := r.URL.Query().Get("start")
	end := r.URL.Query().Get("end")
	if start == "" || end == "" {
		jsonError(w, "start and end required", http.StatusBadRequest)
		return
	}

	rows, err := db.Query(
		"SELECT id, user_id, content, url, done, created_at, updated_at FROM todos WHERE user_id = ? AND done = 1 AND date(updated_at) >= ? AND date(updated_at) <= ? ORDER BY updated_at DESC",
		userID, start, end,
	)
	if err != nil {
		jsonError(w, "Internal error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	todos := []Todo{}
	for rows.Next() {
		var t Todo
		var done int
		rows.Scan(&t.ID, &t.UserID, &t.Content, &t.URL, &done, &t.CreatedAt, &t.UpdatedAt)
		t.Done = done != 0
		todos = append(todos, t)
	}
	jsonOK(w, map[string]interface{}{"todos": todos})
}

func handleGetTodos(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	all := r.URL.Query().Get("all")

	var rows *sql.Rows
	var err error
	if all == "1" {
		rows, err = db.Query(
			"SELECT id, user_id, content, url, done, created_at, updated_at FROM todos WHERE user_id = ? ORDER BY created_at DESC",
			userID,
		)
	} else {
		rows, err = db.Query(
			"SELECT id, user_id, content, url, done, created_at, updated_at FROM todos WHERE user_id = ? AND done = 0 ORDER BY created_at DESC",
			userID,
		)
	}
	if err != nil {
		jsonError(w, "Internal error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	todos := []Todo{}
	for rows.Next() {
		var t Todo
		var done int
		rows.Scan(&t.ID, &t.UserID, &t.Content, &t.URL, &done, &t.CreatedAt, &t.UpdatedAt)
		t.Done = done != 0
		todos = append(todos, t)
	}
	jsonOK(w, map[string]interface{}{"todos": todos})
}

func handleCreateTodo(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)

	var req struct {
		Content string `json:"content"`
		URL     string `json:"url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if strings.TrimSpace(req.Content) == "" && strings.TrimSpace(req.URL) == "" {
		jsonError(w, "Content or URL is required", http.StatusBadRequest)
		return
	}

	now := nowDatetime()
	result, err := db.Exec(
		"INSERT INTO todos (user_id, content, url, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
		userID, req.Content, req.URL, now, now,
	)
	if err != nil {
		jsonError(w, "Failed to create todo", http.StatusInternalServerError)
		return
	}

	id, _ := result.LastInsertId()
	todo := Todo{
		ID:        id,
		UserID:    userID,
		Content:   req.Content,
		URL:       req.URL,
		Done:      false,
		CreatedAt: now,
		UpdatedAt: now,
	}
	jsonOK(w, map[string]interface{}{"todo": todo})
}

func handleUpdateTodo(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	id := r.URL.Query().Get("id")
	if id == "" {
		jsonError(w, "id query parameter is required", http.StatusBadRequest)
		return
	}

	var req struct {
		Content *string `json:"content"`
		URL     *string `json:"url"`
		Done    *bool   `json:"done"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Verify ownership
	var existing Todo
	var done int
	err := db.QueryRow(
		"SELECT id, user_id, content, url, done, created_at, updated_at FROM todos WHERE id = ? AND user_id = ?",
		id, userID,
	).Scan(&existing.ID, &existing.UserID, &existing.Content, &existing.URL, &done, &existing.CreatedAt, &existing.UpdatedAt)
	if err != nil {
		jsonError(w, "Todo not found", http.StatusNotFound)
		return
	}
	existing.Done = done != 0

	if req.Content != nil {
		existing.Content = *req.Content
	}
	if req.URL != nil {
		existing.URL = *req.URL
	}
	if req.Done != nil {
		existing.Done = *req.Done
	}

	now := nowDatetime()
	doneInt := 0
	if existing.Done {
		doneInt = 1
	}
	_, err = db.Exec(
		"UPDATE todos SET content = ?, url = ?, done = ?, updated_at = ? WHERE id = ? AND user_id = ?",
		existing.Content, existing.URL, doneInt, now, id, userID,
	)
	if err != nil {
		jsonError(w, "Failed to update todo", http.StatusInternalServerError)
		return
	}

	existing.UpdatedAt = now
	jsonOK(w, map[string]interface{}{"todo": existing})
}

func handleDeleteTodo(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	id := r.URL.Query().Get("id")
	if id == "" {
		jsonError(w, "id query parameter is required", http.StatusBadRequest)
		return
	}

	result, err := db.Exec("DELETE FROM todos WHERE id = ? AND user_id = ?", id, userID)
	if err != nil {
		jsonError(w, "Failed to delete todo", http.StatusInternalServerError)
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		jsonError(w, "Todo not found", http.StatusNotFound)
		return
	}

	jsonOK(w, map[string]string{"message": "Todo deleted"})
}

// --- Checklist handlers ---

type Checklist struct {
	ID        int64  `json:"id"`
	UserID    int64  `json:"user_id"`
	Title     string `json:"title"`
	Items     string `json:"items"` // JSON array of strings
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

func handleChecklists(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case "GET":
		handleGetChecklists(w, r)
	case "POST":
		handleCreateChecklist(w, r)
	case "PUT":
		handleUpdateChecklist(w, r)
	case "DELETE":
		handleDeleteChecklist(w, r)
	default:
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func handleGetChecklists(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)

	rows, err := db.Query(
		"SELECT id, user_id, title, items, created_at, updated_at FROM checklists WHERE user_id = ? ORDER BY updated_at DESC",
		userID,
	)
	if err != nil {
		jsonError(w, "Internal error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	checklists := []Checklist{}
	for rows.Next() {
		var c Checklist
		rows.Scan(&c.ID, &c.UserID, &c.Title, &c.Items, &c.CreatedAt, &c.UpdatedAt)
		checklists = append(checklists, c)
	}
	jsonOK(w, map[string]interface{}{"checklists": checklists})
}

func handleCreateChecklist(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)

	var req struct {
		Title string   `json:"title"`
		Items []string `json:"items"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if strings.TrimSpace(req.Title) == "" {
		jsonError(w, "Title is required", http.StatusBadRequest)
		return
	}

	if req.Items == nil {
		req.Items = []string{}
	}
	itemsJSON, _ := json.Marshal(req.Items)

	now := nowDatetime()
	result, err := db.Exec(
		"INSERT INTO checklists (user_id, title, items, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
		userID, req.Title, string(itemsJSON), now, now,
	)
	if err != nil {
		jsonError(w, "Failed to create checklist", http.StatusInternalServerError)
		return
	}

	id, _ := result.LastInsertId()
	checklist := Checklist{
		ID:        id,
		UserID:    userID,
		Title:     req.Title,
		Items:     string(itemsJSON),
		CreatedAt: now,
		UpdatedAt: now,
	}
	jsonOK(w, map[string]interface{}{"checklist": checklist})
}

func handleUpdateChecklist(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	id := r.URL.Query().Get("id")
	if id == "" {
		jsonError(w, "id query parameter is required", http.StatusBadRequest)
		return
	}

	var req struct {
		Title *string  `json:"title"`
		Items []string `json:"items"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Verify ownership
	var existing Checklist
	err := db.QueryRow(
		"SELECT id, user_id, title, items, created_at, updated_at FROM checklists WHERE id = ? AND user_id = ?",
		id, userID,
	).Scan(&existing.ID, &existing.UserID, &existing.Title, &existing.Items, &existing.CreatedAt, &existing.UpdatedAt)
	if err != nil {
		jsonError(w, "Checklist not found", http.StatusNotFound)
		return
	}

	if req.Title != nil {
		existing.Title = *req.Title
	}
	if req.Items != nil {
		itemsJSON, _ := json.Marshal(req.Items)
		existing.Items = string(itemsJSON)
	}

	now := nowDatetime()
	_, err = db.Exec(
		"UPDATE checklists SET title = ?, items = ?, updated_at = ? WHERE id = ? AND user_id = ?",
		existing.Title, existing.Items, now, id, userID,
	)
	if err != nil {
		jsonError(w, "Failed to update checklist", http.StatusInternalServerError)
		return
	}

	existing.UpdatedAt = now
	jsonOK(w, map[string]interface{}{"checklist": existing})
}

func handleDeleteChecklist(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	id := r.URL.Query().Get("id")
	if id == "" {
		jsonError(w, "id query parameter is required", http.StatusBadRequest)
		return
	}

	result, err := db.Exec("DELETE FROM checklists WHERE id = ? AND user_id = ?", id, userID)
	if err != nil {
		jsonError(w, "Failed to delete checklist", http.StatusInternalServerError)
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		jsonError(w, "Checklist not found", http.StatusNotFound)
		return
	}

	jsonOK(w, map[string]string{"message": "Checklist deleted"})
}

// --- Iteration Override handlers ---

func handleIterationOverrides(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case "GET":
		handleGetIterationOverrides(w, r)
	case "POST":
		handleCreateIterationOverride(w, r)
	case "DELETE":
		handleDeleteIterationOverride(w, r)
	default:
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func handleGetIterationOverrides(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)

	rows, err := db.Query(
		"SELECT id, user_id, iteration_number, start_date, end_date, created_at, updated_at FROM iteration_overrides WHERE user_id = ? ORDER BY iteration_number",
		userID,
	)
	if err != nil {
		jsonError(w, "Internal error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	overrides := []IterationOverride{}
	for rows.Next() {
		var o IterationOverride
		rows.Scan(&o.ID, &o.UserID, &o.IterationNumber, &o.StartDate, &o.EndDate, &o.CreatedAt, &o.UpdatedAt)
		overrides = append(overrides, o)
	}
	jsonOK(w, map[string]interface{}{"overrides": overrides})
}

func handleCreateIterationOverride(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)

	var req struct {
		IterationNumber int64  `json:"iteration_number"`
		StartDate       string `json:"start_date"`
		EndDate         string `json:"end_date"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.IterationNumber < 1 {
		jsonError(w, "iteration_number must be >= 1", http.StatusBadRequest)
		return
	}

	startDate, err := time.Parse("2006-01-02", req.StartDate)
	if err != nil {
		jsonError(w, "start_date must be in YYYY-MM-DD format", http.StatusBadRequest)
		return
	}

	endDate, err := time.Parse("2006-01-02", req.EndDate)
	if err != nil {
		jsonError(w, "end_date must be in YYYY-MM-DD format", http.StatusBadRequest)
		return
	}

	if startDate.After(endDate) {
		jsonError(w, "start_date must be <= end_date", http.StatusBadRequest)
		return
	}

	now := nowDatetime()

	// Upsert: try update first, then insert
	result, err := db.Exec(
		"UPDATE iteration_overrides SET start_date = ?, end_date = ?, updated_at = ? WHERE user_id = ? AND iteration_number = ?",
		req.StartDate, req.EndDate, now, userID, req.IterationNumber,
	)
	if err != nil {
		jsonError(w, "Internal error", http.StatusInternalServerError)
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		_, err = db.Exec(
			"INSERT INTO iteration_overrides (user_id, iteration_number, start_date, end_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
			userID, req.IterationNumber, req.StartDate, req.EndDate, now, now,
		)
		if err != nil {
			jsonError(w, "Internal error", http.StatusInternalServerError)
			return
		}
	}

	// Fetch the upserted record
	var o IterationOverride
	err = db.QueryRow(
		"SELECT id, user_id, iteration_number, start_date, end_date, created_at, updated_at FROM iteration_overrides WHERE user_id = ? AND iteration_number = ?",
		userID, req.IterationNumber,
	).Scan(&o.ID, &o.UserID, &o.IterationNumber, &o.StartDate, &o.EndDate, &o.CreatedAt, &o.UpdatedAt)
	if err != nil {
		jsonError(w, "Internal error", http.StatusInternalServerError)
		return
	}

	jsonOK(w, map[string]interface{}{"override": o})
}

func handleDeleteIterationOverride(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	iterationNumber := r.URL.Query().Get("iteration_number")
	if iterationNumber == "" {
		jsonError(w, "iteration_number query parameter is required", http.StatusBadRequest)
		return
	}

	result, err := db.Exec("DELETE FROM iteration_overrides WHERE user_id = ? AND iteration_number = ?", userID, iterationNumber)
	if err != nil {
		jsonError(w, "Failed to delete override", http.StatusInternalServerError)
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		jsonError(w, "Override not found", http.StatusNotFound)
		return
	}

	jsonOK(w, map[string]string{"message": "Override deleted"})
}

// --- Export/Import Data ---

type ExportData struct {
	Attendance         []Attendance        `json:"attendance"`
	WorkLogs           []WorkLog           `json:"work_logs"`
	Lessons            []Lesson            `json:"lessons"`
	Todos              []Todo              `json:"todos"`
	Checklists         []Checklist         `json:"checklists"`
	UserSettings       map[string]string   `json:"user_settings"`
	IterationOverrides []IterationOverride `json:"iteration_overrides"`
	ExportedAt         string              `json:"exported_at"`
}

func handleDataExport(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserID(r)

	attendances := []Attendance{}
	rows, err := db.Query(
		"SELECT id, user_id, date, clock_in, clock_out, status, created_at, updated_at FROM attendance WHERE user_id = ? ORDER BY date",
		userID,
	)
	if err != nil {
		jsonError(w, "Failed to export attendance", http.StatusInternalServerError)
		return
	}
	for rows.Next() {
			var a Attendance
			rows.Scan(&a.ID, &a.UserID, &a.Date, &a.ClockIn, &a.ClockOut, &a.Status, &a.CreatedAt, &a.UpdatedAt)
			attendances = append(attendances, a)
		}
		rows.Close()

	workLogsList := []WorkLog{}
	rows, err = db.Query(
		"SELECT id, user_id, date, content, created_at, updated_at FROM work_logs WHERE user_id = ? ORDER BY date",
		userID,
	)
	if err != nil {
		jsonError(w, "Failed to export work logs", http.StatusInternalServerError)
		return
	}
	for rows.Next() {
		var wl WorkLog
		rows.Scan(&wl.ID, &wl.UserID, &wl.Date, &wl.Content, &wl.CreatedAt, &wl.UpdatedAt)
		workLogsList = append(workLogsList, wl)
	}
	rows.Close()

	lessonsList := []Lesson{}
	rows, err = db.Query(
		"SELECT id, user_id, date, content, created_at, updated_at FROM lessons WHERE user_id = ? ORDER BY date",
		userID,
	)
	if err != nil {
		jsonError(w, "Failed to export lessons", http.StatusInternalServerError)
		return
	}
	for rows.Next() {
		var l Lesson
		rows.Scan(&l.ID, &l.UserID, &l.Date, &l.Content, &l.CreatedAt, &l.UpdatedAt)
		lessonsList = append(lessonsList, l)
	}
	rows.Close()

	todosList := []Todo{}
	rows, err = db.Query(
		"SELECT id, user_id, content, url, done, created_at, updated_at FROM todos WHERE user_id = ? ORDER BY id",
		userID,
	)
	if err != nil {
		jsonError(w, "Failed to export todos", http.StatusInternalServerError)
		return
	}
	for rows.Next() {
		var t Todo
		rows.Scan(&t.ID, &t.UserID, &t.Content, &t.URL, &t.Done, &t.CreatedAt, &t.UpdatedAt)
		todosList = append(todosList, t)
	}
	rows.Close()

	checklistsList := []Checklist{}
	rows, err = db.Query(
		"SELECT id, user_id, title, items, created_at, updated_at FROM checklists WHERE user_id = ? ORDER BY id",
		userID,
	)
	if err != nil {
		jsonError(w, "Failed to export checklists", http.StatusInternalServerError)
		return
	}
	for rows.Next() {
		var c Checklist
		rows.Scan(&c.ID, &c.UserID, &c.Title, &c.Items, &c.CreatedAt, &c.UpdatedAt)
		checklistsList = append(checklistsList, c)
	}
	rows.Close()

	userSettings := map[string]string{}
	rows, err = db.Query("SELECT key, value FROM user_settings WHERE user_id = ?", userID)
	if err != nil {
		jsonError(w, "Failed to export user settings", http.StatusInternalServerError)
		return
	}
	for rows.Next() {
		var k, v string
		rows.Scan(&k, &v)
		userSettings[k] = v
	}
	rows.Close()

	overridesList := []IterationOverride{}
	rows, err = db.Query(
		"SELECT id, user_id, iteration_number, start_date, end_date, created_at, updated_at FROM iteration_overrides WHERE user_id = ? ORDER BY iteration_number",
		userID,
	)
	if err != nil {
		jsonError(w, "Failed to export iteration overrides", http.StatusInternalServerError)
		return
	}
	for rows.Next() {
		var o IterationOverride
		rows.Scan(&o.ID, &o.UserID, &o.IterationNumber, &o.StartDate, &o.EndDate, &o.CreatedAt, &o.UpdatedAt)
		overridesList = append(overridesList, o)
	}
	rows.Close()

	exportData := ExportData{
		Attendance:         attendances,
		WorkLogs:           workLogsList,
		Lessons:            lessonsList,
		Todos:              todosList,
		Checklists:         checklistsList,
		UserSettings:       userSettings,
		IterationOverrides: overridesList,
		ExportedAt:         time.Now().Format(time.RFC3339),
	}

	// Build zip in memory
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)

	// Write data.json
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

	// Read the uploaded file (50MB max)
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

	// Extract data.json
	var importData struct {
		Attendance []Attendance `json:"attendance"`
		WorkLogs   []WorkLog    `json:"work_logs"`
		Lessons    []Lesson     `json:"lessons"`
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

	// Upsert attendance and work logs
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
			result, err := db.Exec(
				"UPDATE attendance SET clock_in = ?, clock_out = ?, status = ?, updated_at = ? WHERE user_id = ? AND date = ?",
				a.ClockIn, a.ClockOut, status, now, userID, a.Date,
			)
			if err != nil {
				continue
			}

			rowsAffected, _ := result.RowsAffected()
			if rowsAffected == 0 {
				_, err = db.Exec(
					"INSERT INTO attendance (user_id, date, clock_in, clock_out, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
					userID, a.Date, a.ClockIn, a.ClockOut, status, now, now,
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

	lessonCount := 0
	for _, l := range importData.Lessons {
		if l.Date == "" {
			continue
		}
		now := nowDatetime()
		result, err := db.Exec(
			"UPDATE lessons SET content = ?, updated_at = ? WHERE user_id = ? AND date = ?",
			l.Content, now, userID, l.Date,
		)
		if err != nil {
			continue
		}
		rowsAffected, _ := result.RowsAffected()
		if rowsAffected == 0 {
			_, err = db.Exec(
				"INSERT INTO lessons (user_id, date, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
				userID, l.Date, l.Content, now, now,
			)
			if err != nil {
				continue
			}
		}
		lessonCount++
	}

	jsonOK(w, map[string]interface{}{
		"message":          "Data imported successfully",
		"attendance_count": attendanceCount,
		"work_log_count":   workLogCount,
		"lesson_count":     lessonCount,
	})
}

// --- Delete All Data ---

func handleDataDelete(w http.ResponseWriter, r *http.Request) {
	if r.Method != "DELETE" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserID(r)

	// Verify password for safety
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

	// Delete all user data
	tables := []string{"attendance", "work_logs", "lessons", "todos", "checklists", "iteration_overrides"}
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

	jsonOK(w, map[string]interface{}{
		"message":          "All data deleted successfully",
		"attendance_count": counts["attendance"],
		"work_log_count":   counts["work_logs"],
		"lesson_count":     counts["lessons"],
		"todo_count":       counts["todos"],
	})
}

// --- History date range ---

func handleHistoryDateRange(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserID(r)

	var earliest, latest sql.NullString
	err := db.QueryRow(`
		SELECT MIN(d), MAX(d) FROM (
			SELECT date AS d FROM attendance WHERE user_id = ?
			UNION ALL
			SELECT date AS d FROM work_logs WHERE user_id = ?
			UNION ALL
			SELECT date AS d FROM lessons WHERE user_id = ?
			UNION ALL
			SELECT date(updated_at) AS d FROM todos WHERE user_id = ? AND done = 1
		)
	`, userID, userID, userID, userID).Scan(&earliest, &latest)
	if err != nil {
		jsonError(w, "Internal error", http.StatusInternalServerError)
		return
	}

	if !earliest.Valid {
		jsonOK(w, map[string]interface{}{"earliest": nil, "latest": nil})
		return
	}

	jsonOK(w, map[string]interface{}{"earliest": earliest.String, "latest": latest.String})
}

func handleSystemVersion(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	type Version struct {
		Commit  string `json:"commit"`
		Date    string `json:"date"`
		Content string `json:"content"`
	}

	var v Version
	// Try reading from file first
	data, err := os.ReadFile("version.json")
	if err == nil {
		if err := json.Unmarshal(data, &v); err == nil && v.Commit != "" {
			w.Header().Set("Content-Type", "application/json")
			w.Write(data)
			return
		}
	}

	// Fallback to git
	cmd := exec.Command("git", "log", "-1", "--format={\"commit\":\"%h\",\"date\":\"%cd\",\"content\":\"%s\"}", "--date=short")
	out, err := cmd.Output()
	if err == nil {
		w.Header().Set("Content-Type", "application/json")
		w.Write(out)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"commit":"unknown","date":"unknown","content":"unknown"}`))
}
