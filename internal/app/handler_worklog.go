package app

import (
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// 工作日志 handler

func findWorkLog(app core.App, userID, date string) (*core.Record, error) {
	return app.FindFirstRecordByFilter(workLogCollection, "user = {:user} && date = {:date}",
		dbx.Params{"user": userID, "date": date})
}

func handleWorkLogSave(e *core.RequestEvent) error {
	var req struct {
		Date    string `json:"date"`
		Content string `json:"content"`
	}
	if err := e.BindBody(&req); err != nil {
		return e.BadRequestError("Invalid request body", err)
	}
	if req.Date == "" {
		req.Date = today()
	}
	if !validDate(req.Date) {
		return e.BadRequestError("date must be in YYYY-MM-DD format", nil)
	}

	record, err := findWorkLog(e.App, e.Auth.Id, req.Date)
	if isNotFound(err) {
		record, err = newUserRecord(e.App, workLogCollection, e.Auth.Id)
		if err == nil {
			record.Set("date", req.Date)
		}
	}
	if err != nil {
		return e.InternalServerError("Internal error", err)
	}
	record.Set("content", req.Content)
	if err := e.App.Save(record); err != nil {
		return e.InternalServerError("Internal error", err)
	}
	workLog := workLogFromRecord(record)
	return e.JSON(200, WorkLogResponse{WorkLog: &workLog})
}

func handleWorkLogToday(e *core.RequestEvent) error {
	record, err := findWorkLog(e.App, e.Auth.Id, today())
	if isNotFound(err) {
		return e.JSON(200, WorkLogResponse{})
	} else if err != nil {
		return e.InternalServerError("Internal error", err)
	}
	workLog := workLogFromRecord(record)
	return e.JSON(200, WorkLogResponse{WorkLog: &workLog})
}

func handleWorkLogRange(e *core.RequestEvent) error {
	start := e.Request.URL.Query().Get("start")
	end := e.Request.URL.Query().Get("end")
	if start == "" || end == "" {
		return e.BadRequestError("start and end query parameters are required", nil)
	}
	records, err := findUserRecords(e.App, workLogCollection, "date >= {:start} && date <= {:end}", "date",
		dbx.Params{"user": e.Auth.Id, "start": start, "end": end})
	if err != nil {
		return e.InternalServerError("Internal error", err)
	}
	return e.JSON(200, WorkLogListResponse{WorkLogs: mapRecords(records, workLogFromRecord)})
}
