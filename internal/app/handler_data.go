package app

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// 数据导出/删除 handler。导出为 ZIP（data.json），删除清空当前账号的全部业务数据。

const maxDataArchiveBytes int64 = 50 << 20

// 导出/删除覆盖的业务 collection（用户设置保存在账号记录上，单独处理）。
var userDataCollections = []string{
	attendanceCollection, workLogCollection, todoCollection, ticketIssueCollection,
	snapshotCollection, checklistCollection, iterationOverrideCollection, holidayCollection,
}

func handleDataExport(e *core.RequestEvent) error {
	var data *ExportData
	// 在同一事务中读取，保证各 collection 数据一致。
	err := e.App.RunInTransaction(func(txApp core.App) error {
		var err error
		data, err = buildExportData(txApp, e.Auth.Id)
		return err
	})
	if err != nil {
		return e.InternalServerError("Failed to export data", err)
	}
	var buf bytes.Buffer
	if err := writeDataZip(&buf, data); err != nil || int64(buf.Len()) > maxDataArchiveBytes {
		return e.InternalServerError("Failed to create export ZIP", err)
	}
	e.Response.Header().Set("Content-Disposition",
		fmt.Sprintf(`attachment; filename="workey-export-%s.zip"`, time.Now().Format(dateFormat)))
	return e.Blob(200, "application/zip", buf.Bytes())
}

func buildExportData(app core.App, userID string) (*ExportData, error) {
	account, err := app.FindRecordById(accountCollection, userID)
	if err != nil {
		return nil, err
	}
	params := dbx.Params{"user": userID}
	records := map[string][]*core.Record{}
	sorts := map[string]string{
		attendanceCollection: "date", workLogCollection: "date", todoCollection: "@rowid",
		ticketIssueCollection: "occurred_on,@rowid", checklistCollection: "@rowid", snapshotCollection: "@rowid",
		iterationOverrideCollection: "iteration_number", holidayCollection: "date",
	}
	for _, collection := range userDataCollections {
		if records[collection], err = findUserRecords(app, collection, "", sorts[collection], params); err != nil {
			return nil, fmt.Errorf("query %s: %w", collection, err)
		}
	}
	return &ExportData{
		Attendance:         mapRecords(records[attendanceCollection], attendanceFromRecord),
		WorkLogs:           mapRecords(records[workLogCollection], workLogFromRecord),
		Todos:              mapRecords(records[todoCollection], todoFromRecord),
		TicketIssues:       mapRecords(records[ticketIssueCollection], ticketIssueFromRecord),
		Checklists:         mapRecords(records[checklistCollection], checklistFromRecord),
		ChecklistSnapshots: mapRecords(records[snapshotCollection], snapshotFromRecord),
		UserSettings:       storedSettings(account),
		IterationOverrides: mapRecords(records[iterationOverrideCollection], iterationOverrideFromRecord),
		HolidayCalendar:    mapRecords(records[holidayCollection], holidayFromRecord),
		ExportedAt:         time.Now().UTC().Format(time.RFC3339),
	}, nil
}

func writeDataZip(writer io.Writer, data *ExportData) error {
	jsonBytes, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return err
	}
	if int64(len(jsonBytes)) > maxDataArchiveBytes {
		return fmt.Errorf("Export data exceeds 50MB")
	}
	zw := zip.NewWriter(writer)
	fw, err := zw.Create("data.json")
	if err != nil {
		zw.Close()
		return err
	}
	if _, err := fw.Write(jsonBytes); err != nil {
		zw.Close()
		return err
	}
	return zw.Close()
}

func handleDataDelete(e *core.RequestEvent) error {
	var req struct {
		Password string `json:"password"`
	}
	if err := e.BindBody(&req); err != nil || req.Password == "" {
		return e.BadRequestError("Password is required to delete data", nil)
	}
	if !e.Auth.ValidatePassword(req.Password) {
		return e.UnauthorizedError("Password is incorrect", nil)
	}

	counts := map[string]int64{}
	err := e.App.RunInTransaction(func(txApp core.App) error {
		for _, collection := range userDataCollections {
			records, err := findUserRecords(txApp, collection, "", "", dbx.Params{"user": e.Auth.Id})
			if err != nil {
				return err
			}
			for _, record := range records {
				if err := txApp.Delete(record); err != nil {
					return err
				}
			}
			counts[collection] = int64(len(records))
		}
		return nil
	})
	if err != nil {
		return e.InternalServerError("Failed to delete data", err)
	}
	return e.JSON(200, DataDeleteResponse{
		Message:          "All data deleted successfully",
		AttendanceCount:  counts[attendanceCollection],
		WorkLogCount:     counts[workLogCollection],
		TodoCount:        counts[todoCollection],
		TicketIssueCount: counts[ticketIssueCollection],
	})
}
