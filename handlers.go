package main

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
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

	jsonOK(w, map[string]string{"timezone": timezone})
}

func handlePostSettings(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)

	var req struct {
		Timezone string `json:"timezone"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Timezone == "" {
		jsonError(w, "Timezone is required", http.StatusBadRequest)
		return
	}

	_, err := db.Exec(
		"INSERT INTO user_settings (user_id, key, value) VALUES (?, 'timezone', ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value",
		userID, req.Timezone,
	)
	if err != nil {
		jsonError(w, "Failed to save settings", http.StatusInternalServerError)
		return
	}

	jsonOK(w, map[string]string{"timezone": req.Timezone})
}

// --- Export/Import Data ---

type ExportData struct {
	Attendance []Attendance `json:"attendance"`
	WorkLogs   []WorkLog    `json:"work_logs"`
	ExportedAt string       `json:"exported_at"`
}

func handleDataExport(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserID(r)

	attendances := []Attendance{}
	rows, err := db.Query(
		"SELECT id, user_id, date, clock_in, clock_out, created_at, updated_at FROM attendance WHERE user_id = ? ORDER BY date",
		userID,
	)
	if err != nil {
		jsonError(w, "Failed to export attendance", http.StatusInternalServerError)
		return
	}
	for rows.Next() {
		var a Attendance
		rows.Scan(&a.ID, &a.UserID, &a.Date, &a.ClockIn, &a.ClockOut, &a.CreatedAt, &a.UpdatedAt)
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

	exportData := ExportData{
		Attendance: attendances,
		WorkLogs:   workLogsList,
		ExportedAt: time.Now().Format(time.RFC3339),
	}

	jsonOK(w, exportData)
}

func handleDataImport(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserID(r)

	var importData struct {
		Attendance []Attendance `json:"attendance"`
		WorkLogs   []WorkLog    `json:"work_logs"`
	}
	if err := json.NewDecoder(r.Body).Decode(&importData); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	attendanceCount := 0
	workLogCount := 0

	for _, a := range importData.Attendance {
		if a.Date == "" {
			continue
		}
		now := nowDatetime()
		result, err := db.Exec(
			"UPDATE attendance SET clock_in = ?, clock_out = ?, updated_at = ? WHERE user_id = ? AND date = ?",
			a.ClockIn, a.ClockOut, now, userID, a.Date,
		)
		if err != nil {
			continue
		}
		rowsAffected, _ := result.RowsAffected()
		if rowsAffected == 0 {
			_, err = db.Exec(
				"INSERT INTO attendance (user_id, date, clock_in, clock_out, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
				userID, a.Date, a.ClockIn, a.ClockOut, now, now,
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

	jsonOK(w, map[string]interface{}{
		"message":          "Data imported successfully",
		"attendance_count": attendanceCount,
		"work_log_count":   workLogCount,
	})
}

// --- Image Upload ---

func handleUpload(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 10MB max
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		jsonError(w, "File too large (max 10MB)", http.StatusBadRequest)
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		jsonError(w, "No file provided", http.StatusBadRequest)
		return
	}
	defer file.Close()

	// Validate file type
	ext := strings.ToLower(filepath.Ext(header.Filename))
	allowed := map[string]bool{
		".jpg": true, ".jpeg": true, ".png": true,
		".gif": true, ".webp": true, ".svg": true,
	}
	if !allowed[ext] {
		jsonError(w, "Only image files are allowed (jpg, png, gif, webp, svg)", http.StatusBadRequest)
		return
	}

	// Generate unique filename: timestamp + random hex
	b := make([]byte, 8)
	rand.Read(b)
	filename := fmt.Sprintf("%d-%s%s", time.Now().UnixMilli(), hex.EncodeToString(b), ext)

	uploadsDir := filepath.Join(dataDir, "uploads")
	dstPath := filepath.Join(uploadsDir, filename)

	dst, err := os.Create(dstPath)
	if err != nil {
		jsonError(w, "Failed to save file", http.StatusInternalServerError)
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		jsonError(w, "Failed to save file", http.StatusInternalServerError)
		return
	}

	url := "/uploads/" + filename
	jsonOK(w, map[string]string{
		"url":      url,
		"filename": filename,
		"markdown": fmt.Sprintf("![%s](%s)", header.Filename, url),
	})
}
