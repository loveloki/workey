package main

import (
	"database/sql"
	"encoding/json"
	"net/http"
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

	// Check if already clocked in today
	var existingID int64
	err := db.QueryRow("SELECT id FROM attendance WHERE user_id = ? AND date = ?", userID, date).Scan(&existingID)
	if err == nil {
		jsonError(w, "Already clocked in today", http.StatusConflict)
		return
	}

	_, err = db.Exec(
		"INSERT INTO attendance (user_id, date, clock_in, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
		userID, date, now, now, now,
	)
	if err != nil {
		jsonError(w, "Failed to clock in", http.StatusInternalServerError)
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
		"UPDATE attendance SET clock_out = ?, updated_at = ? WHERE user_id = ? AND date = ?",
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
		"SELECT id, user_id, date, clock_in, clock_out, created_at, updated_at FROM attendance WHERE user_id = ? AND date >= ? AND date <= ? ORDER BY date",
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
		rows.Scan(&a.ID, &a.UserID, &a.Date, &a.ClockIn, &a.ClockOut, &a.CreatedAt, &a.UpdatedAt)
		attendances = append(attendances, a)
	}
	jsonOK(w, map[string]interface{}{"attendances": attendances})
}

func getAttendance(userID int64, date string) *Attendance {
	var a Attendance
	err := db.QueryRow(
		"SELECT id, user_id, date, clock_in, clock_out, created_at, updated_at FROM attendance WHERE user_id = ? AND date = ?",
		userID, date,
	).Scan(&a.ID, &a.UserID, &a.Date, &a.ClockIn, &a.ClockOut, &a.CreatedAt, &a.UpdatedAt)
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
