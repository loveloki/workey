package app

import (
	"database/sql"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strconv"
	"time"
)

// 考勤打卡相关 handler

func handleClockIn(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserID(r)
	date, nowStr, now := nowAll()

	var req struct {
		IsOvertime *bool `json:"is_overtime"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil && err != io.EOF {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	overtime := 0
	if req.IsOvertime != nil && *req.IsOvertime {
		overtime = 1
	}

	var existingID int64
	var existingClockIn *string
	err := db.QueryRow("SELECT id, clock_in FROM attendance WHERE user_id = ? AND date = ?", userID, date).Scan(&existingID, &existingClockIn)

	if err == nil {
		if existingClockIn != nil {
			jsonError(w, "Already clocked in today", http.StatusConflict)
			return
		}
		_, err = db.Exec(
			"UPDATE attendance SET clock_in = ?, status = 'normal', is_overtime = ?, updated_at = ? WHERE id = ?",
			nowStr, overtime, nowStr, existingID,
		)
		if err != nil {
			jsonError(w, "Failed to clock in", http.StatusInternalServerError)
			return
		}
	} else if err == sql.ErrNoRows {
		_, err = db.Exec(
			"INSERT INTO attendance (user_id, date, clock_in, status, is_overtime, created_at, updated_at) VALUES (?, ?, ?, 'normal', ?, ?, ?)",
			userID, date, nowStr, overtime, nowStr, nowStr,
		)
		if err != nil {
			jsonError(w, "Failed to clock in", http.StatusInternalServerError)
			return
		}
	} else {
		jsonError(w, "Database error", http.StatusInternalServerError)
		return
	}

	scheduleReminder(userID, now)

	attendance, err := getAttendance(userID, date)
	if err != nil {
		jsonError(w, "Failed to retrieve attendance", http.StatusInternalServerError)
		return
	}
	jsonOK(w, AttendanceResponse{Attendance: attendance})
}

func scheduleReminder(userID int64, clockInTime time.Time) {
	delay := getUserReminderDelay(userID)
	sendAt := clockInTime.Add(time.Duration(delay) * time.Hour).Format(time.RFC3339)

	_, err := db.Exec(
		"INSERT INTO pending_reminders (user_id, send_at) VALUES (?, ?)",
		userID, sendAt,
	)
	if err != nil {
		log.Printf("Failed to insert pending reminder: %v", err)
	}
}

func getUserReminderDelay(userID int64) int {
	var val string
	err := db.QueryRow("SELECT value FROM user_settings WHERE user_id = ? AND key = 'reminder_delay'", userID).Scan(&val)
	if err != nil {
		return 9
	}
	if v, err := strconv.Atoi(val); err == nil && v > 0 {
		return v
	}
	return 9
}

func deletePendingReminders(userID int64) {
	_, err := db.Exec("DELETE FROM pending_reminders WHERE user_id = ?", userID)
	if err != nil {
		log.Printf("Failed to delete pending reminders for user %d: %v", userID, err)
	}
}

func handleAttendanceOvertime(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" && r.Method != "PUT" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserID(r)
	var req struct {
		Date       string `json:"date"`
		IsOvertime bool   `json:"is_overtime"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if req.Date == "" {
		jsonError(w, "date is required", http.StatusBadRequest)
		return
	}

	overtime := 0
	if req.IsOvertime {
		overtime = 1
	}
	_, now, _ := nowAll()

	res, err := db.Exec(
		"UPDATE attendance SET is_overtime = ?, updated_at = ? WHERE user_id = ? AND date = ?",
		overtime, now, userID, req.Date,
	)
	if err != nil {
		jsonError(w, "Failed to update", http.StatusInternalServerError)
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		jsonError(w, "No attendance record on that date", http.StatusNotFound)
		return
	}

	attendance, err := getAttendance(userID, req.Date)
	if err != nil {
		jsonError(w, "Failed to retrieve attendance", http.StatusInternalServerError)
		return
	}
	jsonOK(w, AttendanceResponse{Attendance: attendance})
}

func handleLeave(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserID(r)
	date, nowStr, _ := nowAll()

	var existingID int64
	err := db.QueryRow("SELECT id FROM attendance WHERE user_id = ? AND date = ?", userID, date).Scan(&existingID)

	if err == nil {
		_, err = db.Exec(
			"UPDATE attendance SET clock_in = NULL, clock_out = NULL, status = 'leave', updated_at = ? WHERE id = ?",
			nowStr, existingID,
		)
	} else if err == sql.ErrNoRows {
		_, err = db.Exec(
			"INSERT INTO attendance (user_id, date, clock_in, clock_out, status, created_at, updated_at) VALUES (?, ?, NULL, NULL, 'leave', ?, ?)",
			userID, date, nowStr, nowStr,
		)
	} else {
		jsonError(w, "Database error", http.StatusInternalServerError)
		return
	}

	if err != nil {
		jsonError(w, "Failed to set leave status", http.StatusInternalServerError)
		return
	}

	deletePendingReminders(userID)

	attendance, err := getAttendance(userID, date)
	if err != nil {
		jsonError(w, "Failed to retrieve attendance", http.StatusInternalServerError)
		return
	}
	jsonOK(w, AttendanceResponse{Attendance: attendance})
}

func handleClockOut(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserID(r)
	date, nowStr, _ := nowAll()

	var existingID int64
	err := db.QueryRow("SELECT id FROM attendance WHERE user_id = ? AND date = ?", userID, date).Scan(&existingID)
	if err == sql.ErrNoRows {
		jsonError(w, "Not clocked in today", http.StatusBadRequest)
		return
	}

	_, err = db.Exec(
		"UPDATE attendance SET clock_out = ?, status = 'normal', updated_at = ? WHERE user_id = ? AND date = ?",
		nowStr, nowStr, userID, date,
	)
	if err != nil {
		jsonError(w, "Failed to clock out", http.StatusInternalServerError)
		return
	}

	deletePendingReminders(userID)

	attendance, err := getAttendance(userID, date)
	if err != nil {
		jsonError(w, "Failed to retrieve attendance", http.StatusInternalServerError)
		return
	}
	jsonOK(w, AttendanceResponse{Attendance: attendance})
}

func handleAttendanceToday(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserID(r)
	attendance, err := getAttendance(userID, today())
	if err != nil {
		if err != sql.ErrNoRows {
			jsonError(w, "Database error", http.StatusInternalServerError)
			return
		}
		jsonOK(w, AttendanceResponse{})
		return
	}
	jsonOK(w, AttendanceResponse{Attendance: attendance})
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
			COUNT(CASE WHEN status != 'leave' AND is_overtime = 1 THEN 1 END) as overtime_days,
			COUNT(CASE WHEN status = 'leave' THEN 1 END) as leave_days
		FROM attendance 
		WHERE user_id = ?
	`, userID).Scan(&overtimeDays, &leaveDays)

	if err != nil {
		jsonError(w, "Failed to calculate stats", http.StatusInternalServerError)
		return
	}

	jsonOK(w, AttendanceStatsResponse{
		GlobalOvertimeDays: int64(overtimeDays),
		GlobalLeaveDays:    int64(leaveDays),
		GlobalRemaining:    int64(overtimeDays - leaveDays),
	})
}

func scanAttendance(s scanner) (Attendance, error) {
	var a Attendance
	var ov int
	err := s.Scan(&a.ID, &a.UserID, &a.Date, &a.ClockIn, &a.ClockOut, &a.Status, &ov, &a.CreatedAt, &a.UpdatedAt)
	if err != nil {
		return a, err
	}
	a.IsOvertime = ov == 1
	return a, nil
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
		"SELECT id, user_id, date, clock_in, clock_out, status, is_overtime, created_at, updated_at FROM attendance WHERE user_id = ? AND date >= ? AND date <= ? ORDER BY date",
		userID, start, end,
	)
	if err != nil {
		jsonError(w, "Internal error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	attendances := []Attendance{}
	for rows.Next() {
		a, err := scanAttendance(rows)
		if err != nil {
			jsonError(w, "Failed to scan row", http.StatusInternalServerError)
			return
		}
		attendances = append(attendances, a)
	}
	if err := rows.Err(); err != nil {
		jsonError(w, "Database error", http.StatusInternalServerError)
		return
	}
	jsonOK(w, AttendanceListResponse{Attendances: attendances})
}

func getAttendance(userID int64, date string) (*Attendance, error) {
	a, err := scanAttendance(db.QueryRow(
		"SELECT id, user_id, date, clock_in, clock_out, status, is_overtime, created_at, updated_at FROM attendance WHERE user_id = ? AND date = ?",
		userID, date,
	))
	if err != nil {
		return nil, err
	}
	return &a, nil
}
