package app

import (
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// 考勤打卡相关 handler

func findAttendance(app core.App, userID, date string) (*core.Record, error) {
	return app.FindFirstRecordByFilter(attendanceCollection, "user = {:user} && date = {:date}",
		dbx.Params{"user": userID, "date": date})
}

// todayAttendanceRecord 返回今天的考勤记录，不存在时返回一条未保存的新记录。
func todayAttendanceRecord(app core.App, userID string) (*core.Record, error) {
	record, err := findAttendance(app, userID, today())
	if err == nil {
		return record, nil
	}
	if !isNotFound(err) {
		return nil, err
	}
	record, err = newUserRecord(app, attendanceCollection, userID)
	if err != nil {
		return nil, err
	}
	record.Set("date", today())
	return record, nil
}

func saveAttendance(e *core.RequestEvent, record *core.Record, failure string) error {
	if err := e.App.Save(record); err != nil {
		return e.InternalServerError(failure, err)
	}
	attendance := attendanceFromRecord(record)
	return e.JSON(200, AttendanceResponse{Attendance: &attendance})
}

func handleClockIn(e *core.RequestEvent) error {
	var req struct {
		IsOvertime *bool  `json:"is_overtime"`
		Status     string `json:"status"`
	}
	if err := e.BindBody(&req); err != nil {
		return e.BadRequestError("Invalid request body", err)
	}
	status := req.Status
	if status == "" {
		status = "normal"
	}
	if status != "normal" && status != "business_trip" {
		return e.BadRequestError("Invalid attendance status", nil)
	}

	record, err := todayAttendanceRecord(e.App, e.Auth.Id)
	if err != nil {
		return e.InternalServerError("Database error", err)
	}
	if record.GetString("clock_in") != "" {
		return e.Error(409, "Already clocked in today", nil)
	}
	record.Set("clock_in", nowDatetime())
	record.Set("clock_out", "")
	record.Set("status", status)
	record.Set("is_overtime", req.IsOvertime != nil && *req.IsOvertime)
	return saveAttendance(e, record, "Failed to clock in")
}

func handleClockOut(e *core.RequestEvent) error {
	record, err := findAttendance(e.App, e.Auth.Id, today())
	if err != nil && !isNotFound(err) {
		return e.InternalServerError("Database error", err)
	}
	if record == nil || record.GetString("clock_in") == "" {
		return e.BadRequestError("Not clocked in today", nil)
	}
	if record.GetString("status") == "business_trip" {
		return e.BadRequestError("Business trip only requires clock-in", nil)
	}
	record.Set("clock_out", nowDatetime())
	record.Set("status", "normal")
	return saveAttendance(e, record, "Failed to clock out")
}

func handleLeave(e *core.RequestEvent) error {
	record, err := todayAttendanceRecord(e.App, e.Auth.Id)
	if err != nil {
		return e.InternalServerError("Database error", err)
	}
	record.Set("clock_in", "")
	record.Set("clock_out", "")
	record.Set("status", "leave")
	return saveAttendance(e, record, "Failed to set leave status")
}

func handleAttendanceOvertime(e *core.RequestEvent) error {
	var req struct {
		Date       string `json:"date"`
		IsOvertime bool   `json:"is_overtime"`
	}
	if err := e.BindBody(&req); err != nil {
		return e.BadRequestError("Invalid request body", err)
	}
	if req.Date == "" {
		return e.BadRequestError("date is required", nil)
	}
	record, err := findAttendance(e.App, e.Auth.Id, req.Date)
	if isNotFound(err) {
		return e.NotFoundError("No attendance record on that date", nil)
	} else if err != nil {
		return e.InternalServerError("Database error", err)
	}
	record.Set("is_overtime", req.IsOvertime)
	return saveAttendance(e, record, "Failed to update")
}

func handleAttendanceToday(e *core.RequestEvent) error {
	record, err := findAttendance(e.App, e.Auth.Id, today())
	if isNotFound(err) {
		return e.JSON(200, AttendanceResponse{})
	} else if err != nil {
		return e.InternalServerError("Database error", err)
	}
	attendance := attendanceFromRecord(record)
	return e.JSON(200, AttendanceResponse{Attendance: &attendance})
}

func handleAttendanceStats(e *core.RequestEvent) error {
	var stats struct {
		OvertimeDays int64 `db:"overtime_days"`
		LeaveDays    int64 `db:"leave_days"`
	}
	// 聚合统计直接查询 collection 表，避免加载全部记录。
	err := e.App.DB().NewQuery(`
		SELECT
			COUNT(CASE WHEN status != 'leave' AND is_overtime = 1 THEN 1 END) AS overtime_days,
			COUNT(CASE WHEN status = 'leave' THEN 1 END) AS leave_days
		FROM attendance WHERE user = {:user}`).Bind(dbx.Params{"user": e.Auth.Id}).One(&stats)
	if err != nil {
		return e.InternalServerError("Failed to calculate stats", err)
	}
	return e.JSON(200, AttendanceStatsResponse{
		GlobalOvertimeDays: stats.OvertimeDays,
		GlobalLeaveDays:    stats.LeaveDays,
		GlobalRemaining:    stats.OvertimeDays - stats.LeaveDays,
	})
}

func handleAttendanceRange(e *core.RequestEvent) error {
	start := e.Request.URL.Query().Get("start")
	end := e.Request.URL.Query().Get("end")
	if start == "" || end == "" {
		return e.BadRequestError("start and end query parameters are required", nil)
	}
	records, err := findUserRecords(e.App, attendanceCollection, "date >= {:start} && date <= {:end}", "date",
		dbx.Params{"user": e.Auth.Id, "start": start, "end": end})
	if err != nil {
		return e.InternalServerError("Internal error", err)
	}
	return e.JSON(200, AttendanceListResponse{Attendances: mapRecords(records, attendanceFromRecord)})
}
