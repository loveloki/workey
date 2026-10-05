package app

import (
	"archive/zip"
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

// 数据导出/导入/删除 handler

func handleDataExport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	tx, err := db.Begin()
	if err != nil {
		jsonError(w, "Failed to start data export", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()
	data, err := buildExportData(r.Context(), tx, getUserID(r))
	if err != nil {
		jsonError(w, "Failed to export data", http.StatusInternalServerError)
		return
	}
	// 凭据、同步配置等不属于业务备份，绝不通过 user_settings 透传。
	for key := range data.UserSettings {
		if !isDataBusinessSetting(key) {
			delete(data.UserSettings, key)
		}
	}
	if err := tx.Commit(); err != nil {
		jsonError(w, "Failed to finish data export", http.StatusInternalServerError)
		return
	}
	var buf bytes.Buffer
	if err := writeDataZip(&buf, data); err != nil || int64(buf.Len()) > maxDataArchiveBytes {
		jsonError(w, "Failed to create export ZIP", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition",
		fmt.Sprintf(`attachment; filename="workey-export-%s.zip"`, time.Now().Format("2006-01-02")))
	if _, err := w.Write(buf.Bytes()); err != nil {
		// 响应可能已部分发送，此时不能再追加 JSON 错误破坏 ZIP。
		log.Printf("Failed to send data export: %v", err)
	}
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

const maxDataArchiveBytes int64 = 50 << 20
const archivedChecklistTitlePrefix = "已删除的检查清单 #"

func handleDataImport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// multipart 的内存阈值不是上传限额；同时限制整个请求和实际 ZIP 文件大小。
	r.Body = http.MaxBytesReader(w, r.Body, maxDataArchiveBytes+(1<<20))
	reader, err := r.MultipartReader()
	if err != nil {
		jsonError(w, "Invalid multipart upload", http.StatusBadRequest)
		return
	}
	var archive []byte
	for {
		part, err := reader.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			jsonError(w, "Invalid or oversized upload (max 50MB)", http.StatusBadRequest)
			return
		}
		if part.FormName() != "file" || part.FileName() == "" || archive != nil {
			part.Close()
			jsonError(w, "Exactly one file is required", http.StatusBadRequest)
			return
		}
		archive, err = io.ReadAll(io.LimitReader(part, maxDataArchiveBytes+1))
		part.Close()
		if err != nil || int64(len(archive)) > maxDataArchiveBytes {
			jsonError(w, "File too large or unreadable (max 50MB)", http.StatusBadRequest)
			return
		}
	}
	if archive == nil {
		jsonError(w, "No file provided", http.StatusBadRequest)
		return
	}
	data, err := decodeDataArchive(archive)
	if err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}
	userID := getUserID(r)
	if err := prepareDataImport(&data, userID, nowDatetime()); err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}

	tx, err := db.Begin()
	if err != nil {
		jsonError(w, "Failed to start data import", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()
	response, err := importDataTransaction(tx, userID, data)
	if err != nil {
		jsonError(w, "Failed to import data; no changes saved", http.StatusInternalServerError)
		return
	}
	if err := tx.Commit(); err != nil {
		jsonError(w, "Failed to commit data import", http.StatusInternalServerError)
		return
	}
	response.Message = "Data imported successfully"
	jsonOK(w, response)
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
	decoder := json.NewDecoder(bytes.NewReader(jsonBytes))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&data); err != nil {
		return data, fmt.Errorf("Invalid data.json format: %w", err)
	}
	return data, nil
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

func isDataBusinessSetting(key string) bool {
	switch key {
	case "timezone", "kanban_url", "theme", "iteration_start_date", "iteration_duration_days", "iteration_workdays", "reminder_delay":
		return true
	default:
		return false
	}
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
func prepareDataImport(data *ExportData, userID int64, now string) error {
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
	checklistIDs := make(map[int64]bool)
	for i := range data.Checklists {
		c := &data.Checklists[i]
		c.UserID = userID
		if c.ID < 0 || (c.ID != 0 && checklistIDs[c.ID]) || strings.TrimSpace(c.Title) == "" {
			return fmt.Errorf("Invalid or duplicate checklist ID/title")
		}
		if c.ID != 0 {
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
	archivedIndices := make(map[int64]int)
	for i := range data.ChecklistSnapshots {
		snapshot := &data.ChecklistSnapshots[i]
		snapshot.UserID = userID
		if snapshot.ChecklistID <= 0 {
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
				Title: fmt.Sprintf("%s%d", archivedChecklistTitlePrefix, snapshot.ChecklistID),
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
		if isDataBusinessSetting(key) && value != "" {
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
			// 先除后乘，保持旧换算的舍入规则并避免大整数溢出。
			workdays := (days/7)*5 + ((days%7)*5+3)/7
			if workdays < 1 {
				workdays = 1
			}
			settings["iteration_workdays"] = strconv.Itoa(workdays)
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

// 所有读写都只能通过同一个事务执行；查询/写入错误直接传播，交由调用者回滚。
func importDataTransaction(tx *sql.Tx, userID int64, data ExportData) (DataImportResponse, error) {
	var response DataImportResponse
	for _, a := range data.Attendance {
		_, err := tx.Exec(`INSERT INTO attendance
			(user_id, date, clock_in, clock_out, status, is_overtime, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(user_id, date) DO UPDATE SET clock_in = excluded.clock_in,
			clock_out = excluded.clock_out, status = excluded.status, is_overtime = excluded.is_overtime,
			created_at = excluded.created_at, updated_at = excluded.updated_at`,
			userID, a.Date, a.ClockIn, a.ClockOut, a.Status, a.IsOvertime, a.CreatedAt, a.UpdatedAt)
		if err != nil {
			return response, fmt.Errorf("attendance: %w", err)
		}
		response.AttendanceCount++
	}
	for _, wl := range data.WorkLogs {
		_, err := tx.Exec(`INSERT INTO work_logs (user_id, date, content, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, date) DO UPDATE SET content = excluded.content,
			created_at = excluded.created_at, updated_at = excluded.updated_at`,
			userID, wl.Date, wl.Content, wl.CreatedAt, wl.UpdatedAt)
		if err != nil {
			return response, fmt.Errorf("work_logs: %w", err)
		}
		response.WorkLogCount++
	}
	checklistIDMap := make(map[int64]int64)
	consumedChecklists := make(map[int64]bool)
	for _, c := range data.Checklists {
		id, err := findImportChecklistID(tx, userID, c, consumedChecklists)
		if err != nil {
			return response, fmt.Errorf("query checklists: %w", err)
		}
		if id != 0 {
			_, err = tx.Exec("UPDATE checklists SET items = ?, created_at = ?, updated_at = ? WHERE id = ? AND user_id = ?",
				c.Items, c.CreatedAt, c.UpdatedAt, id, userID)
		} else {
			id, err = insertImportRecord(tx, `INSERT INTO checklists (user_id, title, items, kind, created_at, updated_at)
				VALUES (?, ?, ?, 'manual', ?, ?)`, userID, c.Title, c.Items, c.CreatedAt, c.UpdatedAt)
		}
		if err != nil {
			return response, fmt.Errorf("checklists: %w", err)
		}
		consumedChecklists[id] = true
		if c.ID != 0 {
			checklistIDMap[c.ID] = id
		}
		response.ChecklistCount++
	}
	consumedSnapshots := make(map[int64]bool)
	for _, snapshot := range data.ChecklistSnapshots {
		checklistID, ok := checklistIDMap[snapshot.ChecklistID]
		if !ok {
			return response, fmt.Errorf("missing checklist mapping")
		}
		id, err := findEquivalentImportID(tx, consumedSnapshots, snapshot.CreatedAt, snapshot.CreatedAt,
			`SELECT id, created_at, created_at FROM checklist_snapshots
			WHERE user_id = ? AND checklist_id = ? AND title = ? AND items_hash = ? AND data = ? ORDER BY id`,
			userID, checklistID, snapshot.Title, snapshot.ItemsHash, snapshot.Data)
		if err != nil {
			return response, fmt.Errorf("query checklist_snapshots: %w", err)
		}
		if id == 0 {
			id, err = insertImportRecord(tx, `INSERT INTO checklist_snapshots
				(user_id, checklist_id, title, items_hash, data, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
				userID, checklistID, snapshot.Title, snapshot.ItemsHash, snapshot.Data, snapshot.CreatedAt)
		}
		if err != nil {
			return response, fmt.Errorf("checklist_snapshots: %w", err)
		}
		consumedSnapshots[id] = true
		response.SnapshotCount++
	}
	consumedTodos := make(map[int64]bool)
	for _, todo := range data.Todos {
		id, err := findEquivalentImportID(tx, consumedTodos, todo.CreatedAt, todo.UpdatedAt,
			"SELECT id, created_at, updated_at FROM todos WHERE user_id = ? AND content = ? AND url = ? AND done = ? ORDER BY id",
			userID, todo.Content, todo.URL, todo.Done)
		if err != nil {
			return response, fmt.Errorf("query todos: %w", err)
		}
		if id == 0 {
			id, err = insertImportRecord(tx, "INSERT INTO todos (user_id, content, url, done, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
				userID, todo.Content, todo.URL, todo.Done, todo.CreatedAt, todo.UpdatedAt)
		}
		if err != nil {
			return response, fmt.Errorf("todos: %w", err)
		}
		consumedTodos[id] = true
		response.TodoCount++
	}
	consumedIssues := make(map[int64]bool)
	for _, issue := range data.TicketIssues {
		id, err := findEquivalentImportID(tx, consumedIssues, issue.CreatedAt, issue.UpdatedAt,
			`SELECT id, created_at, updated_at FROM ticket_issues WHERE user_id = ? AND ticket_no = ? AND ticket_title = ?
			AND ticket_url = ? AND occurred_on = ? AND cause_type = ? AND problem_description = ?
			AND cause_detail = ? AND resolution = ? ORDER BY id`,
			userID, issue.TicketNo, issue.TicketTitle, issue.TicketURL, issue.OccurredOn, issue.CauseType,
			issue.ProblemDescription, issue.CauseDetail, issue.Resolution)
		if err != nil {
			return response, fmt.Errorf("query ticket_issues: %w", err)
		}
		if id == 0 {
			id, err = insertImportRecord(tx, `INSERT INTO ticket_issues (user_id, ticket_no, ticket_title, ticket_url, occurred_on,
				cause_type, problem_description, cause_detail, resolution, created_at, updated_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				userID, issue.TicketNo, issue.TicketTitle, issue.TicketURL, issue.OccurredOn, issue.CauseType,
				issue.ProblemDescription, issue.CauseDetail, issue.Resolution, issue.CreatedAt, issue.UpdatedAt)
		}
		if err != nil {
			return response, fmt.Errorf("ticket_issues: %w", err)
		}
		consumedIssues[id] = true
		response.TicketIssueCount++
	}
	for key, value := range data.UserSettings {
		if !isDataBusinessSetting(key) {
			return response, fmt.Errorf("setting is not allowed")
		}
		_, err := tx.Exec(`INSERT INTO user_settings (user_id, key, value) VALUES (?, ?, ?)
			ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value`, userID, key, value)
		if err != nil {
			return response, fmt.Errorf("user_settings: %w", err)
		}
	}
	for _, o := range data.IterationOverrides {
		_, err := tx.Exec(`INSERT INTO iteration_overrides (user_id, iteration_number, start_date, end_date, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, iteration_number) DO UPDATE SET
			start_date = excluded.start_date, end_date = excluded.end_date,
			created_at = excluded.created_at, updated_at = excluded.updated_at`,
			userID, o.IterationNumber, o.StartDate, o.EndDate, o.CreatedAt, o.UpdatedAt)
		if err != nil {
			return response, fmt.Errorf("iteration_overrides: %w", err)
		}
		response.OverrideCount++
	}
	for _, day := range data.HolidayCalendar {
		_, err := tx.Exec(`INSERT INTO holiday_calendar_days (user_id, date, is_workday, name, source, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, date) DO UPDATE SET
			is_workday = excluded.is_workday, name = excluded.name, source = excluded.source,
			created_at = excluded.created_at, updated_at = excluded.updated_at`,
			userID, day.Date, day.IsWorkday, day.Name, day.Source, day.CreatedAt, day.UpdatedAt)
		if err != nil {
			return response, fmt.Errorf("holiday_calendar: %w", err)
		}
		response.CalendarDayCount++
	}
	return response, nil
}

func insertImportRecord(tx *sql.Tx, query string, args ...any) (int64, error) {
	result, err := tx.Exec(query, args...)
	if err != nil {
		return 0, err
	}
	return result.LastInsertId()
}

// 目标记录一次导入最多匹配一次，保留旧备份中内容甚至时间完全相同的多条合法记录。
// 时间比较使用时间点而非文本，兼容 SQLite DATETIME 和 PocketBase 驱动返回的 RFC3339。
func findEquivalentImportID(tx *sql.Tx, consumed map[int64]bool, created, updated, query string, args ...any) (int64, error) {
	rows, err := tx.Query(query, args...)
	if err != nil {
		return 0, err
	}
	defer rows.Close()
	var matchingID int64
	for rows.Next() {
		var id int64
		var existingCreated, existingUpdated string
		if err := rows.Scan(&id, &existingCreated, &existingUpdated); err != nil {
			return 0, err
		}
		if matchingID == 0 && !consumed[id] && importTimestampsEqual(created, existingCreated) && importTimestampsEqual(updated, existingUpdated) {
			matchingID = id
		}
	}
	return matchingID, rows.Err()
}

func findImportChecklistID(tx *sql.Tx, userID int64, checklist Checklist, consumed map[int64]bool) (int64, error) {
	rows, err := tx.Query("SELECT id, items, created_at, updated_at FROM checklists WHERE user_id = ? AND kind = 'manual' AND title = ? ORDER BY id", userID, checklist.Title)
	if err != nil {
		return 0, err
	}
	defer rows.Close()
	var fallbackID, itemsID, exactID int64
	for rows.Next() {
		var id int64
		var items, created, updated string
		if err := rows.Scan(&id, &items, &created, &updated); err != nil {
			return 0, err
		}
		if consumed[id] {
			continue
		}
		if fallbackID == 0 {
			fallbackID = id
		}
		if items == checklist.Items {
			if itemsID == 0 {
				itemsID = id
			}
			if exactID == 0 && importTimestampsEqual(created, checklist.CreatedAt) && importTimestampsEqual(updated, checklist.UpdatedAt) {
				exactID = id
			}
		}
	}
	if err := rows.Err(); err != nil {
		return 0, err
	}
	if exactID != 0 {
		return exactID, nil
	}
	// 占位模板仅复用完全等价的历史记录，不覆盖碰巧同名的正常模板。
	if strings.HasPrefix(checklist.Title, archivedChecklistTitlePrefix) && checklist.Items == "[]" {
		return 0, nil
	}
	if itemsID != 0 {
		return itemsID, nil
	}
	// 保留旧版按标题更新行为，但不能重复使用刚插入/已更新的模板，避免快照关系合并。
	return fallbackID, nil
}

func handleDataDelete(w http.ResponseWriter, r *http.Request) {
	if r.Method != "DELETE" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserID(r)

	var req struct {
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Password == "" {
		jsonError(w, "Password is required to delete data", http.StatusBadRequest)
		return
	}

	valid, err := validateUserPassword(userID, req.Password)
	if err != nil {
		jsonError(w, "Failed to validate password", http.StatusInternalServerError)
		return
	}

	if !valid {
		jsonError(w, "Password is incorrect", http.StatusUnauthorized)
		return
	}

	tx, err := db.Begin()
	if err != nil {
		jsonError(w, "Failed to start data deletion", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()
	tables := []string{"attendance", "work_logs", "todos", "ticket_issues", "checklist_runs", "checklist_snapshots", "checklists", "iteration_overrides", "holiday_calendar_days"}
	counts := map[string]int64{}
	for _, table := range tables {
		result, err := tx.Exec("DELETE FROM "+table+" WHERE user_id = ?", userID)
		if err != nil {
			jsonError(w, "Failed to delete "+table, http.StatusInternalServerError)
			return
		}
		n, err := result.RowsAffected()
		if err != nil {
			jsonError(w, "Failed to count deleted data", http.StatusInternalServerError)
			return
		}
		counts[table] = n
	}
	if err := tx.Commit(); err != nil {
		jsonError(w, "Failed to commit data deletion", http.StatusInternalServerError)
		return
	}

	jsonOK(w, DataDeleteResponse{
		Message:          "All data deleted successfully",
		AttendanceCount:  counts["attendance"],
		WorkLogCount:     counts["work_logs"],
		TodoCount:        counts["todos"],
		TicketIssueCount: counts["ticket_issues"],
	})
}
