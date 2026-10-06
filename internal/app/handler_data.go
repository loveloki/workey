package app

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"
)

// 数据导出/导入/删除 handler。ZIP 备份（data.json）是旧版数据迁入的唯一通道，
// 导入兼容旧版数字 ID，并保留原始 created_at/updated_at。

const maxDataArchiveBytes int64 = 50 << 20
const archivedChecklistTitlePrefix = "已删除的检查清单 #"

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

func handleDataImport(e *core.RequestEvent) error {
	// 路由已通过 apis.BodyLimit 限制请求体；这里再限制实际 ZIP 文件大小。
	reader, err := e.Request.MultipartReader()
	if err != nil {
		return e.BadRequestError("Invalid multipart upload", err)
	}
	var archive []byte
	for {
		part, err := reader.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			return e.BadRequestError("Invalid or oversized upload (max 50MB)", err)
		}
		if part.FormName() != "file" || part.FileName() == "" || archive != nil {
			part.Close()
			return e.BadRequestError("Exactly one file is required", nil)
		}
		archive, err = io.ReadAll(io.LimitReader(part, maxDataArchiveBytes+1))
		part.Close()
		if err != nil || int64(len(archive)) > maxDataArchiveBytes {
			return e.BadRequestError("File too large or unreadable (max 50MB)", err)
		}
	}
	if archive == nil {
		return e.BadRequestError("No file provided", nil)
	}
	data, err := decodeDataArchive(archive)
	if err != nil {
		return e.BadRequestError(err.Error(), nil)
	}
	userID := e.Auth.Id
	if err := prepareDataImport(&data, RecordID(userID), nowDatetime()); err != nil {
		return e.BadRequestError(err.Error(), nil)
	}

	var response DataImportResponse
	err = e.App.RunInTransaction(func(txApp core.App) error {
		var err error
		response, err = importData(txApp, userID, data)
		return err
	})
	if err != nil {
		return e.InternalServerError("Failed to import data; no changes saved", err)
	}
	response.Message = "Data imported successfully"
	return e.JSON(200, response)
}

// decodeDataArchive 不访问数据库，先校验所有文件的路径、大小和 CRC，再解码唯一的 data.json。
func decodeDataArchive(archive []byte) (ExportData, error) {
	var data ExportData
	if int64(len(archive)) > maxDataArchiveBytes {
		return data, fmt.Errorf("ZIP exceeds 50MB")
	}
	zr, err := zip.NewReader(bytes.NewReader(archive), int64(len(archive)))
	if err != nil {
		return data, fmt.Errorf("Invalid ZIP file")
	}
	if len(zr.File) > 1024 {
		return data, fmt.Errorf("Too many ZIP entries")
	}
	seen := make(map[string]bool)
	var total int64
	var jsonBytes []byte
	for _, f := range zr.File {
		name := f.Name
		if name == "" || name == "." || name == ".." || strings.ContainsAny(name, "/\\:\x00") || !f.Mode().IsRegular() {
			return data, fmt.Errorf("Invalid ZIP entry path")
		}
		key := strings.ToLower(name)
		if seen[key] {
			return data, fmt.Errorf("Duplicate ZIP entry: %s", name)
		}
		seen[key] = true
		remaining := maxDataArchiveBytes - total
		if f.UncompressedSize64 > uint64(remaining) {
			return data, fmt.Errorf("Uncompressed ZIP exceeds 50MB")
		}
		rc, err := f.Open()
		if err != nil {
			return data, fmt.Errorf("Failed to open ZIP entry")
		}
		var n int64
		if name == "data.json" {
			jsonBytes, err = io.ReadAll(io.LimitReader(rc, remaining+1))
			n = int64(len(jsonBytes))
		} else {
			n, err = io.Copy(io.Discard, io.LimitReader(rc, remaining+1))
		}
		closeErr := rc.Close()
		if err != nil || closeErr != nil {
			return data, fmt.Errorf("Invalid ZIP entry contents or checksum")
		}
		if n > remaining {
			return data, fmt.Errorf("Uncompressed ZIP exceeds 50MB")
		}
		total += n
	}
	if jsonBytes == nil {
		return data, fmt.Errorf("data.json not found in ZIP")
	}
	if !utf8.Valid(jsonBytes) {
		return data, fmt.Errorf("Invalid UTF-8 in data.json")
	}
	if err := validateDataJSON(jsonBytes); err != nil {
		return data, fmt.Errorf("Invalid data.json: %w", err)
	}
	var decoded struct {
		ExportData
		// 旧版生产实例仍导出已移除的周期清单进度（checklist_runs），该功能已下线，导入时忽略。
		ChecklistRuns json.RawMessage `json:"checklist_runs"`
	}
	decoder := json.NewDecoder(bytes.NewReader(jsonBytes))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&decoded); err != nil {
		return data, fmt.Errorf("Invalid data.json format: %w", err)
	}
	return decoded.ExportData, nil
}

// encoding/json 默认接受重复键和多个 JSON 值；备份导入必须拒绝这些有歧义的数据。
func validateDataJSON(raw []byte) error {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	first, err := decoder.Token()
	if err != nil || first != json.Delim('{') {
		return fmt.Errorf("expected an object")
	}
	if err := validateDataJSONContainer(decoder, '{', 1); err != nil {
		return err
	}
	if _, err := decoder.Token(); err != io.EOF {
		return fmt.Errorf("trailing JSON data")
	}
	return validateDataJSONFields(raw)
}

// 允许旧导出中的空集合 null，但记录本身与标量字段的 null 不是缺少可选字段。
func validateDataJSONFields(raw []byte) error {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(raw, &fields); err != nil {
		return err
	}
	seenFields := make(map[string]bool)
	for key, value := range fields {
		folded := strings.ToLower(key)
		if seenFields[folded] {
			return fmt.Errorf("duplicate object field: %s", key)
		}
		seenFields[folded] = true
		isNull := bytes.Equal(bytes.TrimSpace(value), []byte("null"))
		switch strings.ToLower(key) {
		case "attendance", "work_logs", "todos", "ticket_issues", "checklists", "checklist_snapshots", "iteration_overrides", "holiday_calendar":
			if isNull {
				continue
			}
			var records []map[string]json.RawMessage
			if err := json.Unmarshal(value, &records); err != nil {
				return err
			}
			for _, record := range records {
				if record == nil {
					return fmt.Errorf("null record in %s", key)
				}
				seen := make(map[string]bool)
				for field, rawValue := range record {
					field = strings.ToLower(field)
					if seen[field] {
						return fmt.Errorf("duplicate record field: %s", field)
					}
					seen[field] = true
					if bytes.Equal(bytes.TrimSpace(rawValue), []byte("null")) && field != "clock_in" && field != "clock_out" {
						return fmt.Errorf("null field in %s: %s", key, field)
					}
				}
			}
		case "user_settings":
			var settings map[string]json.RawMessage
			if err := json.Unmarshal(value, &settings); err != nil {
				return err
			}
			for key, rawValue := range settings {
				if bytes.Equal(bytes.TrimSpace(rawValue), []byte("null")) {
					return fmt.Errorf("null setting: %s", key)
				}
			}
		case "exported_at":
			if isNull {
				return fmt.Errorf("null exported_at")
			}
		}
	}
	return nil
}

func validateDataJSONContainer(decoder *json.Decoder, kind json.Delim, depth int) error {
	if depth > 100 {
		return fmt.Errorf("JSON is nested too deeply")
	}
	keys := make(map[string]bool)
	for decoder.More() {
		if kind == '{' {
			token, err := decoder.Token()
			if err != nil {
				return err
			}
			key, ok := token.(string)
			if !ok {
				return fmt.Errorf("invalid object key")
			}
			if keys[key] {
				return fmt.Errorf("duplicate object key: %s", key)
			}
			keys[key] = true
		}
		token, err := decoder.Token()
		if err != nil {
			return err
		}
		if delimiter, ok := token.(json.Delim); ok {
			if delimiter != '{' && delimiter != '[' {
				return fmt.Errorf("invalid JSON delimiter")
			}
			if err := validateDataJSONContainer(decoder, delimiter, depth+1); err != nil {
				return err
			}
		}
	}
	end, err := decoder.Token()
	if err != nil {
		return err
	}
	if (kind == '{' && end != json.Delim('}')) || (kind == '[' && end != json.Delim(']')) {
		return fmt.Errorf("invalid JSON container")
	}
	return nil
}

// 保持原始时间字符串；仅为旧备份没有提供的可选时间补默认值。
func prepareImportTimestamps(created, updated *string, now string) error {
	if *created == "" {
		*created = *updated
		if *created == "" {
			*created = now
		}
	}
	if *updated == "" {
		*updated = *created
	}
	if !validImportTimestamp(*created) || !validImportTimestamp(*updated) {
		return fmt.Errorf("invalid created_at or updated_at")
	}
	return nil
}

func parseImportTimestamp(value string) (time.Time, error) {
	for _, layout := range []string{"2006-01-02 15:04:05", time.RFC3339Nano, "2006-01-02 15:04:05Z07:00", "2006-01-02T15:04:05"} {
		if parsed, err := time.Parse(layout, value); err == nil {
			return parsed, nil
		}
	}
	return time.Time{}, fmt.Errorf("invalid timestamp")
}

func validImportTimestamp(value string) bool {
	_, err := parseImportTimestamp(value)
	return err == nil
}

func importTimestampsEqual(left, right string) bool {
	a, errA := parseImportTimestamp(left)
	b, errB := parseImportTimestamp(right)
	return errA == nil && errB == nil && a.Equal(b)
}

func validImportClock(value *string) bool {
	if value == nil || *value == "" {
		return true
	}
	if validImportTimestamp(*value) {
		return true
	}
	for _, layout := range []string{"15:04", "15:04:05"} {
		if _, err := time.Parse(layout, *value); err == nil {
			return true
		}
	}
	return false
}

// 校验及补齐在事务前完成，坏数据不能被当作“成功导入”静默跳过。
func prepareDataImport(data *ExportData, userID RecordID, now string) error {
	for i := range data.Attendance {
		a := &data.Attendance[i]
		a.UserID = userID
		if a.Status == "" {
			a.Status = "normal"
		}
		if !validDate(a.Date) || (a.Status != "normal" && a.Status != "leave" && a.Status != "business_trip") || !validImportClock(a.ClockIn) || !validImportClock(a.ClockOut) {
			return fmt.Errorf("Invalid attendance record %d", i+1)
		}
		if err := prepareImportTimestamps(&a.CreatedAt, &a.UpdatedAt, now); err != nil {
			return fmt.Errorf("attendance[%d]: %w", i, err)
		}
	}
	for i := range data.WorkLogs {
		wl := &data.WorkLogs[i]
		wl.UserID = userID
		if !validDate(wl.Date) {
			return fmt.Errorf("Invalid work log date")
		}
		if err := prepareImportTimestamps(&wl.CreatedAt, &wl.UpdatedAt, now); err != nil {
			return fmt.Errorf("work_logs[%d]: %w", i, err)
		}
	}
	for i := range data.Todos {
		todo := &data.Todos[i]
		todo.UserID = userID
		if strings.TrimSpace(todo.Content) == "" && strings.TrimSpace(todo.URL) == "" {
			return fmt.Errorf("Empty todo")
		}
		if err := prepareImportTimestamps(&todo.CreatedAt, &todo.UpdatedAt, now); err != nil {
			return fmt.Errorf("todos[%d]: %w", i, err)
		}
	}
	for i := range data.TicketIssues {
		issue := &data.TicketIssues[i]
		issue.UserID = userID
		// 校验使用副本，避免修改备份中有意义的空白和原文。
		req := ticketIssueRequest{TicketNo: issue.TicketNo, TicketTitle: issue.TicketTitle, TicketURL: issue.TicketURL,
			OccurredOn: issue.OccurredOn, CauseType: issue.CauseType, ProblemDescription: issue.ProblemDescription,
			CauseDetail: issue.CauseDetail, Resolution: issue.Resolution}
		if message := validateTicketIssueRequest(&req); message != "" || !validDate(issue.OccurredOn) || (issue.CauseType != ticketCauseCode && issue.CauseType != ticketCauseOperation) {
			return fmt.Errorf("Invalid ticket issue record %d", i+1)
		}
		if err := prepareImportTimestamps(&issue.CreatedAt, &issue.UpdatedAt, now); err != nil {
			return fmt.Errorf("ticket_issues[%d]: %w", i, err)
		}
	}
	checklistIDs := make(map[RecordID]bool)
	for i := range data.Checklists {
		c := &data.Checklists[i]
		c.UserID = userID
		if (c.ID != "" && checklistIDs[c.ID]) || strings.TrimSpace(c.Title) == "" {
			return fmt.Errorf("Invalid or duplicate checklist ID/title")
		}
		if c.ID != "" {
			checklistIDs[c.ID] = true
		}
		switch c.Kind {
		case "", checklistKindManual, "daily_start", "iteration_end":
			// 已移除的旧版自动清单作为手动清单保留，快照仍映射到同一个清单。
			c.Kind = checklistKindManual
		default:
			return fmt.Errorf("Unknown checklist kind")
		}
		if c.Items == "" {
			c.Items = "[]"
		}
		if !validImportJSONContainer(c.Items, '[') {
			return fmt.Errorf("Invalid checklist items")
		}
		if err := prepareImportTimestamps(&c.CreatedAt, &c.UpdatedAt, now); err != nil {
			return fmt.Errorf("checklists[%d]: %w", i, err)
		}
	}
	archivedIndices := make(map[RecordID]int)
	for i := range data.ChecklistSnapshots {
		snapshot := &data.ChecklistSnapshots[i]
		snapshot.UserID = userID
		if snapshot.ChecklistID == "" {
			return fmt.Errorf("Snapshot references an invalid checklist ID")
		}
		if snapshot.Data == "" {
			snapshot.Data = "{}"
		}
		if !validImportSnapshotJSON(snapshot.Data) {
			return fmt.Errorf("Invalid checklist snapshot data")
		}
		if snapshot.CreatedAt == "" {
			snapshot.CreatedAt = now
		}
		if !validImportTimestamp(snapshot.CreatedAt) {
			return fmt.Errorf("Invalid snapshot created_at")
		}
		// 旧版删除模板不会删除快照；按旧引用建立独立占位模板，不能绑定数据库中的同数字 ID。
		if !checklistIDs[snapshot.ChecklistID] {
			archivedIndices[snapshot.ChecklistID] = len(data.Checklists)
			data.Checklists = append(data.Checklists, Checklist{
				ID: snapshot.ChecklistID, UserID: userID,
				Title: archivedChecklistTitlePrefix + string(snapshot.ChecklistID),
				Items: "[]", Kind: checklistKindManual, CreatedAt: snapshot.CreatedAt, UpdatedAt: snapshot.CreatedAt,
			})
			checklistIDs[snapshot.ChecklistID] = true
		} else if index, ok := archivedIndices[snapshot.ChecklistID]; ok {
			archived := &data.Checklists[index]
			existing, _ := parseImportTimestamp(archived.CreatedAt)
			current, _ := parseImportTimestamp(snapshot.CreatedAt)
			if current.Before(existing) {
				archived.CreatedAt, archived.UpdatedAt = snapshot.CreatedAt, snapshot.CreatedAt
			}
		}
	}
	for i := range data.IterationOverrides {
		o := &data.IterationOverrides[i]
		o.UserID = userID
		if o.IterationNumber < 1 || !validDate(o.StartDate) || !validDate(o.EndDate) || o.StartDate > o.EndDate {
			return fmt.Errorf("Invalid iteration override")
		}
		if err := prepareImportTimestamps(&o.CreatedAt, &o.UpdatedAt, now); err != nil {
			return fmt.Errorf("iteration_overrides[%d]: %w", i, err)
		}
	}
	for i := range data.HolidayCalendar {
		day := &data.HolidayCalendar[i]
		day.UserID = userID
		if !validDate(day.Date) {
			return fmt.Errorf("Invalid holiday calendar date")
		}
		if err := prepareImportTimestamps(&day.CreatedAt, &day.UpdatedAt, now); err != nil {
			return fmt.Errorf("holiday_calendar[%d]: %w", i, err)
		}
	}
	settings := make(map[string]string)
	for key, value := range data.UserSettings {
		if isSettingKey(key) && value != "" {
			settings[key] = value
		}
	}
	if value := settings["iteration_duration_days"]; value != "" {
		days, err := strconv.Atoi(value)
		// 旧客户端允许更长周期，导入不能套用新版 UI 的上限而拒绝合法历史设置。
		if err != nil || days < 1 {
			return fmt.Errorf("Invalid iteration_duration_days")
		}
		if settings["iteration_workdays"] == "" {
			settings["iteration_workdays"] = strconv.Itoa(workdaysFromDurationDays(days))
		}
	}
	if value := settings["iteration_workdays"]; value != "" {
		workdays, err := strconv.Atoi(value)
		if err != nil || workdays < 1 {
			return fmt.Errorf("Invalid iteration_workdays")
		}
	}
	if value := settings["iteration_start_date"]; value != "" && !validDate(value) {
		return fmt.Errorf("Invalid iteration_start_date")
	}
	data.UserSettings = settings
	return nil
}

func validImportJSONContainer(value string, kind json.Delim) bool {
	if !utf8.ValidString(value) {
		return false
	}
	decoder := json.NewDecoder(strings.NewReader(value))
	decoder.UseNumber()
	first, err := decoder.Token()
	if err != nil || first != kind || validateDataJSONContainer(decoder, kind, 1) != nil {
		return false
	}
	_, err = decoder.Token()
	return err == io.EOF
}

// 旧快照接口接受任意 JSON 值（包括 null），迁移只校验语法，不能改变历史原文。
func validImportSnapshotJSON(value string) bool {
	if !utf8.ValidString(value) {
		return false
	}
	decoder := json.NewDecoder(strings.NewReader(value))
	decoder.UseNumber()
	token, err := decoder.Token()
	if err != nil {
		return false
	}
	if kind, ok := token.(json.Delim); ok {
		if (kind != '{' && kind != '[') || validateDataJSONContainer(decoder, kind, 1) != nil {
			return false
		}
	}
	_, err = decoder.Token()
	return err == io.EOF
}

// setImportTimestamps 在保存后写回备份中的原始时间。
// 直接更新 autodate 列：重新导入相同的 updated 值时，PocketBase 会把它视为“未手动修改”而刷新为当前时间。
func setImportTimestamps(app core.App, record *core.Record, created, updated string) error {
	if created == "" && updated == "" {
		return nil
	}
	values := dbx.Params{}
	for field, value := range map[string]string{"created": created, "updated": updated} {
		if value == "" {
			continue
		}
		parsed, err := parseImportTimestamp(value)
		if err != nil {
			return err
		}
		datetime, err := types.ParseDateTime(parsed)
		if err != nil {
			return err
		}
		values[field] = datetime.String()
		record.SetRaw(field, datetime)
	}
	_, err := app.DB().Update(record.Collection().Name, values, dbx.HashExp{"id": record.Id}).Execute()
	return err
}

// saveImported 保存记录并写回原始时间。
func saveImported(app core.App, record *core.Record, created, updated string) error {
	if err := app.Save(record); err != nil {
		return err
	}
	return setImportTimestamps(app, record, created, updated)
}

// upsertByKey 按唯一键查找当前用户的记录，不存在时返回未保存的新记录。
func upsertByKey(app core.App, collection, userID string, key dbx.Params) (*core.Record, error) {
	parts := []string{}
	params := dbx.Params{"user": userID}
	for field, value := range key {
		parts = append(parts, field+" = {:"+field+"}")
		params[field] = value
	}
	records, err := findUserRecords(app, collection, strings.Join(parts, " && "), "", params)
	if err != nil {
		return nil, err
	}
	if len(records) > 0 {
		return records[0], nil
	}
	record, err := newUserRecord(app, collection, userID)
	if err != nil {
		return nil, err
	}
	for field, value := range key {
		record.Set(field, value)
	}
	return record, nil
}

func stringValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

// importData 的所有读写都使用同一个事务 app；任何错误都会让整个导入回滚。
func importData(app core.App, userID string, data ExportData) (DataImportResponse, error) {
	var response DataImportResponse
	for _, a := range data.Attendance {
		record, err := upsertByKey(app, attendanceCollection, userID, dbx.Params{"date": a.Date})
		if err != nil {
			return response, fmt.Errorf("attendance: %w", err)
		}
		record.Set("clock_in", stringValue(a.ClockIn))
		record.Set("clock_out", stringValue(a.ClockOut))
		record.Set("status", a.Status)
		record.Set("is_overtime", a.IsOvertime)
		if err := saveImported(app, record, a.CreatedAt, a.UpdatedAt); err != nil {
			return response, fmt.Errorf("attendance: %w", err)
		}
		response.AttendanceCount++
	}
	for _, wl := range data.WorkLogs {
		record, err := upsertByKey(app, workLogCollection, userID, dbx.Params{"date": wl.Date})
		if err != nil {
			return response, fmt.Errorf("work_logs: %w", err)
		}
		record.Set("content", wl.Content)
		if err := saveImported(app, record, wl.CreatedAt, wl.UpdatedAt); err != nil {
			return response, fmt.Errorf("work_logs: %w", err)
		}
		response.WorkLogCount++
	}

	checklistIDMap := make(map[RecordID]string)
	consumedChecklists := make(map[string]bool)
	for _, c := range data.Checklists {
		record, err := findImportChecklist(app, userID, c, consumedChecklists)
		if err != nil {
			return response, fmt.Errorf("query checklists: %w", err)
		}
		if record == nil {
			if record, err = newUserRecord(app, checklistCollection, userID); err != nil {
				return response, err
			}
			record.Set("title", c.Title)
		}
		record.Set("items", types.JSONRaw(c.Items))
		if err := saveImported(app, record, c.CreatedAt, c.UpdatedAt); err != nil {
			return response, fmt.Errorf("checklists: %w", err)
		}
		consumedChecklists[record.Id] = true
		if c.ID != "" {
			checklistIDMap[c.ID] = record.Id
		}
		response.ChecklistCount++
	}

	consumedSnapshots := make(map[string]bool)
	for _, snapshot := range data.ChecklistSnapshots {
		checklistID, ok := checklistIDMap[snapshot.ChecklistID]
		if !ok {
			return response, fmt.Errorf("missing checklist mapping")
		}
		candidates, err := findUserRecords(app, snapshotCollection,
			"checklist = {:checklist} && title = {:title} && items_hash = {:hash}", "@rowid",
			dbx.Params{"user": userID, "checklist": checklistID, "title": snapshot.Title, "hash": snapshot.ItemsHash})
		if err != nil {
			return response, fmt.Errorf("query checklist_snapshots: %w", err)
		}
		record := findEquivalentImport(candidates, consumedSnapshots, snapshot.CreatedAt, snapshot.CreatedAt,
			func(r *core.Record) bool { return jsonText(r, "data", "null") == snapshot.Data })
		if record == nil {
			if record, err = newUserRecord(app, snapshotCollection, userID); err != nil {
				return response, err
			}
			record.Set("checklist", checklistID)
			record.Set("title", snapshot.Title)
			record.Set("items_hash", snapshot.ItemsHash)
			record.Set("data", types.JSONRaw(snapshot.Data))
			if err := saveImported(app, record, snapshot.CreatedAt, snapshot.CreatedAt); err != nil {
				return response, fmt.Errorf("checklist_snapshots: %w", err)
			}
		}
		consumedSnapshots[record.Id] = true
		response.SnapshotCount++
	}

	consumedTodos := make(map[string]bool)
	for _, todo := range data.Todos {
		candidates, err := findUserRecords(app, todoCollection, "content = {:content} && url = {:url} && done = {:done}", "@rowid",
			dbx.Params{"user": userID, "content": todo.Content, "url": todo.URL, "done": todo.Done})
		if err != nil {
			return response, fmt.Errorf("query todos: %w", err)
		}
		record := findEquivalentImport(candidates, consumedTodos, todo.CreatedAt, todo.UpdatedAt, nil)
		if record == nil {
			if record, err = newUserRecord(app, todoCollection, userID); err != nil {
				return response, err
			}
			record.Set("content", todo.Content)
			record.Set("url", todo.URL)
			record.Set("done", todo.Done)
			if err := saveImported(app, record, todo.CreatedAt, todo.UpdatedAt); err != nil {
				return response, fmt.Errorf("todos: %w", err)
			}
		}
		consumedTodos[record.Id] = true
		response.TodoCount++
	}

	consumedIssues := make(map[string]bool)
	for _, issue := range data.TicketIssues {
		fields := dbx.Params{
			"ticket_no": issue.TicketNo, "ticket_title": issue.TicketTitle, "ticket_url": issue.TicketURL,
			"occurred_on": issue.OccurredOn, "cause_type": issue.CauseType, "problem_description": issue.ProblemDescription,
			"cause_detail": issue.CauseDetail, "resolution": issue.Resolution,
		}
		parts := []string{}
		params := dbx.Params{"user": userID}
		for field, value := range fields {
			parts = append(parts, field+" = {:"+field+"}")
			params[field] = value
		}
		candidates, err := findUserRecords(app, ticketIssueCollection, strings.Join(parts, " && "), "@rowid", params)
		if err != nil {
			return response, fmt.Errorf("query ticket_issues: %w", err)
		}
		record := findEquivalentImport(candidates, consumedIssues, issue.CreatedAt, issue.UpdatedAt, nil)
		if record == nil {
			if record, err = newUserRecord(app, ticketIssueCollection, userID); err != nil {
				return response, err
			}
			for field, value := range fields {
				record.Set(field, value)
			}
			if err := saveImported(app, record, issue.CreatedAt, issue.UpdatedAt); err != nil {
				return response, fmt.Errorf("ticket_issues: %w", err)
			}
		}
		consumedIssues[record.Id] = true
		response.TicketIssueCount++
	}

	if len(data.UserSettings) > 0 {
		account, err := app.FindRecordById(accountCollection, userID)
		if err != nil {
			return response, fmt.Errorf("user_settings: %w", err)
		}
		for key, value := range data.UserSettings {
			if !isSettingKey(key) {
				return response, fmt.Errorf("setting is not allowed")
			}
			account.Set(key, value)
		}
		if err := app.Save(account); err != nil {
			return response, fmt.Errorf("user_settings: %w", err)
		}
	}

	for _, o := range data.IterationOverrides {
		record, err := upsertByKey(app, iterationOverrideCollection, userID, dbx.Params{"iteration_number": o.IterationNumber})
		if err != nil {
			return response, fmt.Errorf("iteration_overrides: %w", err)
		}
		record.Set("start_date", o.StartDate)
		record.Set("end_date", o.EndDate)
		if err := saveImported(app, record, o.CreatedAt, o.UpdatedAt); err != nil {
			return response, fmt.Errorf("iteration_overrides: %w", err)
		}
		response.OverrideCount++
	}
	for _, day := range data.HolidayCalendar {
		if err := upsertHolidayDay(app, userID, day); err != nil {
			return response, fmt.Errorf("holiday_calendar: %w", err)
		}
		response.CalendarDayCount++
	}
	return response, nil
}

// findEquivalentImport 返回第一个未被本次导入占用、时间点（及可选的额外条件）相同的记录。
// 一次导入中每条目标记录最多匹配一次，保留备份中内容甚至时间完全相同的多条合法记录。
func findEquivalentImport(candidates []*core.Record, consumed map[string]bool, created, updated string, match func(*core.Record) bool) *core.Record {
	for _, record := range candidates {
		if consumed[record.Id] || (match != nil && !match(record)) {
			continue
		}
		if importTimestampsEqual(created, formatTime(record.GetDateTime("created"))) &&
			importTimestampsEqual(updated, formatTime(record.GetDateTime("updated"))) {
			return record
		}
	}
	return nil
}

func findImportChecklist(app core.App, userID string, checklist Checklist, consumed map[string]bool) (*core.Record, error) {
	records, err := findUserRecords(app, checklistCollection, "title = {:title}", "@rowid",
		dbx.Params{"user": userID, "title": checklist.Title})
	if err != nil {
		return nil, err
	}
	var fallback, sameItems, exact *core.Record
	for _, record := range records {
		if consumed[record.Id] {
			continue
		}
		if fallback == nil {
			fallback = record
		}
		if jsonText(record, "items", "[]") == checklist.Items {
			if sameItems == nil {
				sameItems = record
			}
			if exact == nil && importTimestampsEqual(formatTime(record.GetDateTime("created")), checklist.CreatedAt) &&
				importTimestampsEqual(formatTime(record.GetDateTime("updated")), checklist.UpdatedAt) {
				exact = record
			}
		}
	}
	if exact != nil {
		return exact, nil
	}
	// 占位模板仅复用完全等价的历史记录，不覆盖碰巧同名的正常模板。
	if strings.HasPrefix(checklist.Title, archivedChecklistTitlePrefix) && checklist.Items == "[]" {
		return nil, nil
	}
	if sameItems != nil {
		return sameItems, nil
	}
	// 保留旧版按标题更新行为，但不能重复使用刚插入/已更新的模板，避免快照关系合并。
	return fallback, nil
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
