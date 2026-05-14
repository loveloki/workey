package main

import (
	"database/sql"
	"encoding/json"
	"net/http"
)

// 考勤打卡相关 handler

func handleClockIn(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserID(r)
	date := today()
	now := nowDatetime()

	var req struct {
		IsOvertime *bool `json:"is_overtime"`
	}
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&req)
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
			now, overtime, now, existingID,
		)
		if err != nil {
			jsonError(w, "Failed to clock in", http.StatusInternalServerError)
			return
		}
	} else if err == sql.ErrNoRows {
		_, err = db.Exec(
			"INSERT INTO attendance (user_id, date, clock_in, status, is_overtime, created_at, updated_at) VALUES (?, ?, ?, 'normal', ?, ?, ?)",
			userID, date, now, overtime, now, now,
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
	now := nowDatetime()

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

	jsonOK(w, getAttendance(userID, req.Date))
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
		_, err = db.Exec(
			"UPDATE attendance SET clock_in = NULL, clock_out = NULL, status = 'leave', updated_at = ? WHERE id = ?",
			now, existingID,
		)
	} else if err == sql.ErrNoRows {
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
			COUNT(CASE WHEN status != 'leave' AND is_overtime = 1 THEN 1 END) as overtime_days,
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
		var a Attendance
		var ov int
		rows.Scan(&a.ID, &a.UserID, &a.Date, &a.ClockIn, &a.ClockOut, &a.Status, &ov, &a.CreatedAt, &a.UpdatedAt)
		a.IsOvertime = ov == 1
		attendances = append(attendances, a)
	}
	jsonOK(w, map[string]interface{}{"attendances": attendances})
}

// getAttendance 查询指定用户指定日期的考勤记录
func getAttendance(userID int64, date string) *Attendance {
	var a Attendance
	var ov int
	err := db.QueryRow(
		"SELECT id, user_id, date, clock_in, clock_out, status, is_overtime, created_at, updated_at FROM attendance WHERE user_id = ? AND date = ?",
		userID, date,
	).Scan(&a.ID, &a.UserID, &a.Date, &a.ClockIn, &a.ClockOut, &a.Status, &ov, &a.CreatedAt, &a.UpdatedAt)
	if err != nil {
		return nil
	}
	a.IsOvertime = ov == 1
	return &a
}
