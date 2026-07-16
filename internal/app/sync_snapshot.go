package app

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"sort"
	"time"
)

// 快照生成、hash 计算、替换式导入逻辑

// buildExportData 在事务内从数据库构建导出数据，确保各个 SELECT 查询的一致性
// 接受事务和 context 参数（m1: 事务保护, m2: context 传播）
func buildExportData(ctx context.Context, tx *sql.Tx, userID int64) (*ExportData, error) {
	attendances := []Attendance{}
	rows, err := tx.QueryContext(ctx,
		"SELECT id, user_id, date, clock_in, clock_out, status, is_overtime, created_at, updated_at FROM attendance WHERE user_id = ? ORDER BY date",
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("query attendance: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var a Attendance
		var ov int
		if err := rows.Scan(&a.ID, &a.UserID, &a.Date, &a.ClockIn, &a.ClockOut, &a.Status, &ov, &a.CreatedAt, &a.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan attendance: %w", err)
		}
		a.IsOvertime = ov == 1
		attendances = append(attendances, a)
	}

	workLogsList := []WorkLog{}
	rows2, err := tx.QueryContext(ctx,
		"SELECT id, user_id, date, content, created_at, updated_at FROM work_logs WHERE user_id = ? ORDER BY date",
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("query work_logs: %w", err)
	}
	defer rows2.Close()
	for rows2.Next() {
		var wl WorkLog
		if err := rows2.Scan(&wl.ID, &wl.UserID, &wl.Date, &wl.Content, &wl.CreatedAt, &wl.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan work_logs: %w", err)
		}
		workLogsList = append(workLogsList, wl)
	}

	todosList := []Todo{}
	rows3, err := tx.QueryContext(ctx,
		"SELECT id, user_id, content, url, done, created_at, updated_at FROM todos WHERE user_id = ? ORDER BY id",
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("query todos: %w", err)
	}
	defer rows3.Close()
	for rows3.Next() {
		var t Todo
		var done int
		if err := rows3.Scan(&t.ID, &t.UserID, &t.Content, &t.URL, &done, &t.CreatedAt, &t.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan todos: %w", err)
		}
		t.Done = done != 0
		todosList = append(todosList, t)
	}

	ticketIssuesList := []TicketIssue{}
	ticketRows, err := tx.QueryContext(ctx, `
		SELECT id, user_id, ticket_no, ticket_title, ticket_url, occurred_on, cause_type,
			problem_description, cause_detail, resolution, created_at, updated_at
		FROM ticket_issues WHERE user_id = ? ORDER BY occurred_on, id`, userID)
	if err != nil {
		return nil, fmt.Errorf("query ticket_issues: %w", err)
	}
	defer ticketRows.Close()
	for ticketRows.Next() {
		issue, scanErr := scanTicketIssue(ticketRows)
		if scanErr != nil {
			return nil, fmt.Errorf("scan ticket_issues: %w", scanErr)
		}
		ticketIssuesList = append(ticketIssuesList, issue)
	}

	checklistsList := []Checklist{}
	rows4, err := tx.QueryContext(ctx,
		"SELECT id, user_id, title, items, kind, created_at, updated_at FROM checklists WHERE user_id = ? ORDER BY id",
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("query checklists: %w", err)
	}
	defer rows4.Close()
	for rows4.Next() {
		var c Checklist
		if err := rows4.Scan(&c.ID, &c.UserID, &c.Title, &c.Items, &c.Kind, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan checklists: %w", err)
		}
		checklistsList = append(checklistsList, c)
	}

	checklistRunsList := []ChecklistRun{}
	runRows, err := tx.QueryContext(ctx, `SELECT id, user_id, checklist_id, kind, occurrence_key,
		iteration_number, title, items, data, completed, completed_at, created_at, updated_at
		FROM checklist_runs WHERE user_id = ? ORDER BY id`, userID)
	if err != nil {
		return nil, fmt.Errorf("query checklist_runs: %w", err)
	}
	defer runRows.Close()
	for runRows.Next() {
		var run ChecklistRun
		var completed int
		if err := runRows.Scan(&run.ID, &run.UserID, &run.ChecklistID, &run.Kind, &run.OccurrenceKey,
			&run.IterationNumber, &run.Title, &run.Items, &run.Data, &completed,
			&run.CompletedAt, &run.CreatedAt, &run.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan checklist_runs: %w", err)
		}
		run.Completed = completed != 0
		checklistRunsList = append(checklistRunsList, run)
	}

	snapshotsList := []ChecklistSnapshot{}
	rows5, err := tx.QueryContext(ctx,
		"SELECT id, user_id, checklist_id, title, items_hash, data, created_at FROM checklist_snapshots WHERE user_id = ? ORDER BY id",
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("query checklist_snapshots: %w", err)
	}
	defer rows5.Close()
	for rows5.Next() {
		var s ChecklistSnapshot
		if err := rows5.Scan(&s.ID, &s.UserID, &s.ChecklistID, &s.Title, &s.ItemsHash, &s.Data, &s.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan checklist_snapshots: %w", err)
		}
		snapshotsList = append(snapshotsList, s)
	}

	userSettings := map[string]string{}
	rows6, err := tx.QueryContext(ctx, "SELECT key, value FROM user_settings WHERE user_id = ?", userID)
	if err != nil {
		return nil, fmt.Errorf("query user_settings: %w", err)
	}
	defer rows6.Close()
	for rows6.Next() {
		var k, v string
		if err := rows6.Scan(&k, &v); err != nil {
			return nil, fmt.Errorf("scan user_settings: %w", err)
		}
		userSettings[k] = v
	}

	overridesList := []IterationOverride{}
	rows7, err := tx.QueryContext(ctx,
		"SELECT id, user_id, iteration_number, start_date, end_date, created_at, updated_at FROM iteration_overrides WHERE user_id = ? ORDER BY iteration_number",
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("query iteration_overrides: %w", err)
	}
	defer rows7.Close()
	for rows7.Next() {
		var o IterationOverride
		if err := rows7.Scan(&o.ID, &o.UserID, &o.IterationNumber, &o.StartDate, &o.EndDate, &o.CreatedAt, &o.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan iteration_overrides: %w", err)
		}
		overridesList = append(overridesList, o)
	}

	calendarDays := []HolidayCalendarDay{}
	rows8, err := tx.QueryContext(ctx, `SELECT id, user_id, date, is_workday, name, source, created_at, updated_at
		FROM holiday_calendar_days WHERE user_id = ? ORDER BY date`, userID)
	if err != nil {
		return nil, fmt.Errorf("query holiday_calendar_days: %w", err)
	}
	defer rows8.Close()
	for rows8.Next() {
		var day HolidayCalendarDay
		var isWorkday int
		if err := rows8.Scan(&day.ID, &day.UserID, &day.Date, &isWorkday, &day.Name,
			&day.Source, &day.CreatedAt, &day.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan holiday_calendar_days: %w", err)
		}
		day.IsWorkday = isWorkday != 0
		calendarDays = append(calendarDays, day)
	}

	return &ExportData{
		Attendance:         attendances,
		WorkLogs:           workLogsList,
		Todos:              todosList,
		TicketIssues:       ticketIssuesList,
		Checklists:         checklistsList,
		ChecklistRuns:      checklistRunsList,
		ChecklistSnapshots: snapshotsList,
		UserSettings:       userSettings,
		IterationOverrides: overridesList,
		HolidayCalendar:    calendarDays,
		ExportedAt:         time.Now().UTC().Format(time.RFC3339),
	}, nil
}

// 用于 hash 计算的精简类型，排除 id/user_id 等会因导入环境变化的字段
// 替换式导入后 SQLite 重新分配 autoincrement ID，同一批数据的 hash 必须一致
type hashAttendance struct {
	Date       string  `json:"date"`
	ClockIn    *string `json:"clock_in"`
	ClockOut   *string `json:"clock_out"`
	Status     string  `json:"status"`
	IsOvertime bool    `json:"is_overtime"`
	CreatedAt  string  `json:"created_at"`
	UpdatedAt  string  `json:"updated_at"`
}

type hashWorkLog struct {
	Date      string `json:"date"`
	Content   string `json:"content"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

type hashTodo struct {
	Content   string `json:"content"`
	URL       string `json:"url"`
	Done      bool   `json:"done"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

type hashTicketIssue struct {
	TicketNo           string `json:"ticket_no"`
	TicketTitle        string `json:"ticket_title"`
	TicketURL          string `json:"ticket_url"`
	OccurredOn         string `json:"occurred_on"`
	CauseType          string `json:"cause_type"`
	ProblemDescription string `json:"problem_description"`
	CauseDetail        string `json:"cause_detail"`
	Resolution         string `json:"resolution"`
	CreatedAt          string `json:"created_at"`
	UpdatedAt          string `json:"updated_at"`
}

type hashChecklist struct {
	Title     string `json:"title"`
	Items     string `json:"items"`
	Kind      string `json:"kind"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

type hashChecklistRun struct {
	ChecklistID     int64   `json:"checklist_id"`
	Kind            string  `json:"kind"`
	OccurrenceKey   string  `json:"occurrence_key"`
	IterationNumber *int64  `json:"iteration_number"`
	Title           string  `json:"title"`
	Items           string  `json:"items"`
	Data            string  `json:"data"`
	Completed       bool    `json:"completed"`
	CompletedAt     *string `json:"completed_at"`
	CreatedAt       string  `json:"created_at"`
	UpdatedAt       string  `json:"updated_at"`
}

type hashChecklistSnapshot struct {
	ChecklistID int64  `json:"checklist_id"` // 保留：用于建立快照与清单的映射关系
	Title       string `json:"title"`
	ItemsHash   string `json:"items_hash"`
	Data        string `json:"data"`
	CreatedAt   string `json:"created_at"`
}

type hashIterationOverride struct {
	IterationNumber int64  `json:"iteration_number"`
	StartDate       string `json:"start_date"`
	EndDate         string `json:"end_date"`
	CreatedAt       string `json:"created_at"`
	UpdatedAt       string `json:"updated_at"`
}

type hashHolidayCalendarDay struct {
	Date      string `json:"date"`
	IsWorkday bool   `json:"is_workday"`
	Name      string `json:"name"`
	Source    string `json:"source"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

// computeDataHash 计算导出数据的确定性 hash
// 只使用业务数据字段（排除 id/user_id），确保同一数据在不同环境中 hash 一致
func computeDataHash(data *ExportData) (string, error) {
	// 对 user_settings 的 key 排序，保证确定性
	keys := make([]string, 0, len(data.UserSettings))
	for k := range data.UserSettings {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	orderedSettings := make([][2]string, 0, len(keys))
	for _, k := range keys {
		orderedSettings = append(orderedSettings, [2]string{k, data.UserSettings[k]})
	}

	hAttendances := make([]hashAttendance, len(data.Attendance))
	for i, a := range data.Attendance {
		hAttendances[i] = hashAttendance{Date: a.Date, ClockIn: a.ClockIn, ClockOut: a.ClockOut, Status: a.Status, IsOvertime: a.IsOvertime, CreatedAt: a.CreatedAt, UpdatedAt: a.UpdatedAt}
	}
	hWorkLogs := make([]hashWorkLog, len(data.WorkLogs))
	for i, wl := range data.WorkLogs {
		hWorkLogs[i] = hashWorkLog{Date: wl.Date, Content: wl.Content, CreatedAt: wl.CreatedAt, UpdatedAt: wl.UpdatedAt}
	}
	hTodos := make([]hashTodo, len(data.Todos))
	for i, t := range data.Todos {
		hTodos[i] = hashTodo{Content: t.Content, URL: t.URL, Done: t.Done, CreatedAt: t.CreatedAt, UpdatedAt: t.UpdatedAt}
	}
	hTicketIssues := make([]hashTicketIssue, len(data.TicketIssues))
	for i, issue := range data.TicketIssues {
		hTicketIssues[i] = hashTicketIssue{
			TicketNo: issue.TicketNo, TicketTitle: issue.TicketTitle, TicketURL: issue.TicketURL,
			OccurredOn: issue.OccurredOn, CauseType: issue.CauseType,
			ProblemDescription: issue.ProblemDescription, CauseDetail: issue.CauseDetail,
			Resolution: issue.Resolution, CreatedAt: issue.CreatedAt, UpdatedAt: issue.UpdatedAt,
		}
	}
	hChecklists := make([]hashChecklist, len(data.Checklists))
	for i, c := range data.Checklists {
		kind := c.Kind
		if kind != checklistKindDailyStart && kind != checklistKindIterationEnd {
			kind = checklistKindManual
		}
		hChecklists[i] = hashChecklist{Title: c.Title, Items: c.Items, Kind: kind, CreatedAt: c.CreatedAt, UpdatedAt: c.UpdatedAt}
	}
	hRuns := make([]hashChecklistRun, len(data.ChecklistRuns))
	for i, run := range data.ChecklistRuns {
		hRuns[i] = hashChecklistRun{
			ChecklistID: run.ChecklistID, Kind: run.Kind, OccurrenceKey: run.OccurrenceKey,
			IterationNumber: run.IterationNumber, Title: run.Title, Items: run.Items, Data: run.Data,
			Completed: run.Completed, CompletedAt: run.CompletedAt, CreatedAt: run.CreatedAt, UpdatedAt: run.UpdatedAt,
		}
	}
	hSnapshots := make([]hashChecklistSnapshot, len(data.ChecklistSnapshots))
	for i, s := range data.ChecklistSnapshots {
		hSnapshots[i] = hashChecklistSnapshot{ChecklistID: s.ChecklistID, Title: s.Title, ItemsHash: s.ItemsHash, Data: s.Data, CreatedAt: s.CreatedAt}
	}
	hOverrides := make([]hashIterationOverride, len(data.IterationOverrides))
	for i, o := range data.IterationOverrides {
		hOverrides[i] = hashIterationOverride{IterationNumber: o.IterationNumber, StartDate: o.StartDate, EndDate: o.EndDate, CreatedAt: o.CreatedAt, UpdatedAt: o.UpdatedAt}
	}
	hCalendar := make([]hashHolidayCalendarDay, len(data.HolidayCalendar))
	for i, day := range data.HolidayCalendar {
		hCalendar[i] = hashHolidayCalendarDay{Date: day.Date, IsWorkday: day.IsWorkday, Name: day.Name,
			Source: day.Source, CreatedAt: day.CreatedAt, UpdatedAt: day.UpdatedAt}
	}

	stable := struct {
		Attendance         []hashAttendance         `json:"attendance"`
		WorkLogs           []hashWorkLog            `json:"work_logs"`
		Todos              []hashTodo               `json:"todos"`
		TicketIssues       []hashTicketIssue        `json:"ticket_issues,omitempty"`
		Checklists         []hashChecklist          `json:"checklists"`
		ChecklistRuns      []hashChecklistRun       `json:"checklist_runs"`
		ChecklistSnapshots []hashChecklistSnapshot  `json:"checklist_snapshots"`
		UserSettings       [][2]string              `json:"user_settings"`
		IterationOverrides []hashIterationOverride  `json:"iteration_overrides"`
		HolidayCalendar    []hashHolidayCalendarDay `json:"holiday_calendar"`
	}{
		Attendance:         hAttendances,
		WorkLogs:           hWorkLogs,
		Todos:              hTodos,
		TicketIssues:       hTicketIssues,
		Checklists:         hChecklists,
		ChecklistRuns:      hRuns,
		ChecklistSnapshots: hSnapshots,
		UserSettings:       orderedSettings,
		IterationOverrides: hOverrides,
		HolidayCalendar:    hCalendar,
	}

	jsonBytes, err := json.Marshal(stable)
	if err != nil {
		return "", err
	}
	h := sha256.Sum256(jsonBytes)
	return fmt.Sprintf("%x", h), nil
}

// snapshotVersionPrefix 是加密快照的版本标识前缀，用于格式演进
// WES1 = Workey Encrypted Snapshot v1（PBKDF2 派生密钥 + AES-GCM）
const snapshotVersionPrefix = "WES1"

// buildEncryptedSnapshot 生成加密的 zip 快照文件内容
// 添加版本前缀以支持格式演进（S2）
func buildEncryptedSnapshot(ctx context.Context, data *ExportData, encKey []byte) ([]byte, string, error) {
	// 先计算 hash
	hashStr, err := computeDataHash(data)
	if err != nil {
		return nil, "", fmt.Errorf("compute hash: %w", err)
	}

	// 构建 zip
	var buf bytes.Buffer
	zv := zip.NewWriter(&buf)
	jsonBytes, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return nil, "", err
	}
	// 使用 CreateHeader 固定时间，避免 zip 时间戳影响 hash
	header := &zip.FileHeader{
		Name:   "data.json",
		Method: zip.Deflate,
	}
	header.SetModTime(time.Unix(0, 0))
	fw, err := zv.CreateHeader(header)
	if err != nil {
		return nil, "", err
	}
	if _, err := fw.Write(jsonBytes); err != nil {
		return nil, "", err
	}
	zv.Close()

	// AES-GCM 加密，aad 使用 "snapshot" 标识，防篁改
	encrypted, err := aesGCMEncrypt(encKey, buf.Bytes(), []byte("snapshot"))
	if err != nil {
		return nil, "", fmt.Errorf("encrypt snapshot: %w", err)
	}
	// 在加密输出前添加版本前缀
	result := make([]byte, len(snapshotVersionPrefix)+len(encrypted))
	copy(result, snapshotVersionPrefix)
	copy(result[len(snapshotVersionPrefix):], encrypted)
	return result, hashStr, nil
}

// maxSnapshotSize 是解压后的快照数据最大字节数，防止 zip bomb 攻击（m3）
const maxSnapshotSize = 100 * 1024 * 1024 // 100MB

// decryptSnapshot 解密快照并解析 ExportData
func decryptSnapshot(ctx context.Context, encrypted, encKey []byte) (*ExportData, error) {
	// 检查并剥离版本前缀
	if len(encrypted) < len(snapshotVersionPrefix) || string(encrypted[:len(snapshotVersionPrefix)]) != snapshotVersionPrefix {
		return nil, fmt.Errorf("unknown snapshot format: missing version prefix")
	}
	payload := encrypted[len(snapshotVersionPrefix):]

	zipBytes, err := aesGCMDecrypt(encKey, payload, []byte("snapshot"))
	if err != nil {
		return nil, fmt.Errorf("decrypt snapshot: %w", err)
	}

	// 解压前检查大小，防止 zip bomb（m3）
	if len(zipBytes) > maxSnapshotSize {
		return nil, fmt.Errorf("snapshot too large: %d bytes (max %d)", len(zipBytes), maxSnapshotSize)
	}

	zr, err := zip.NewReader(bytes.NewReader(zipBytes), int64(len(zipBytes)))
	if err != nil {
		return nil, fmt.Errorf("read zip: %w", err)
	}

	for _, f := range zr.File {
		if f.Name == "data.json" {
			rc, err := f.Open()
			if err != nil {
				return nil, err
			}
			defer rc.Close()
			var data ExportData
			if err := json.NewDecoder(rc).Decode(&data); err != nil {
				return nil, fmt.Errorf("decode data.json: %w", err)
			}
			return &data, nil
		}
	}
	return nil, fmt.Errorf("data.json not found in snapshot")
}

// replaceImportData 在事务内删除当前用户所有数据并插入远端快照数据
// 实现替换式导入，防止重复数据（m2: 添加 context 参数）
func replaceImportData(ctx context.Context, tx *sql.Tx, userID int64, data *ExportData) error {
	// 删除当前用户所有数据
	tables := []string{
		"checklist_runs",
		"checklist_snapshots",
		"checklists",
		"iteration_overrides",
		"holiday_calendar_days",
		"ticket_issues",
		"todos",
		"work_logs",
		"attendance",
		"user_settings",
	}
	for _, table := range tables {
		_, err := tx.Exec("DELETE FROM "+table+" WHERE user_id = ?", userID)
		if err != nil {
			return fmt.Errorf("delete %s: %w", table, err)
		}
	}

	// 插入 attendance
	for _, a := range data.Attendance {
		if a.Date == "" {
			continue
		}
		status := a.Status
		if status == "" {
			status = "normal"
		}
		ov := 0
		if a.IsOvertime {
			ov = 1
		}
		_, err := tx.Exec(
			"INSERT INTO attendance (user_id, date, clock_in, clock_out, status, is_overtime, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
			userID, a.Date, a.ClockIn, a.ClockOut, status, ov, a.CreatedAt, a.UpdatedAt,
		)
		if err != nil {
			return fmt.Errorf("insert attendance %s: %w", a.Date, err)
		}
	}

	// 插入 work_logs
	for _, wl := range data.WorkLogs {
		if wl.Date == "" {
			continue
		}
		_, err := tx.Exec(
			"INSERT INTO work_logs (user_id, date, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
			userID, wl.Date, wl.Content, wl.CreatedAt, wl.UpdatedAt,
		)
		if err != nil {
			return fmt.Errorf("insert work_log %s: %w", wl.Date, err)
		}
	}

	// 插入 todos
	for _, t := range data.Todos {
		doneInt := 0
		if t.Done {
			doneInt = 1
		}
		_, err := tx.Exec(
			"INSERT INTO todos (user_id, content, url, done, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
			userID, t.Content, t.URL, doneInt, t.CreatedAt, t.UpdatedAt,
		)
		if err != nil {
			return fmt.Errorf("insert todo: %w", err)
		}
	}

	// 插入工单问题记录。
	for _, issue := range data.TicketIssues {
		req := ticketIssueRequest{
			TicketNo: issue.TicketNo, TicketTitle: issue.TicketTitle, TicketURL: issue.TicketURL,
			OccurredOn: issue.OccurredOn, CauseType: issue.CauseType,
			ProblemDescription: issue.ProblemDescription, CauseDetail: issue.CauseDetail,
			Resolution: issue.Resolution,
		}
		if message := validateTicketIssueRequest(&req); message != "" {
			return fmt.Errorf("invalid ticket_issue %s: %s", issue.TicketNo, message)
		}
		_, err := tx.Exec(`
			INSERT INTO ticket_issues (
				user_id, ticket_no, ticket_title, ticket_url, occurred_on, cause_type,
				problem_description, cause_detail, resolution, created_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			userID, req.TicketNo, req.TicketTitle, req.TicketURL, req.OccurredOn,
			req.CauseType, req.ProblemDescription, req.CauseDetail, req.Resolution,
			issue.CreatedAt, issue.UpdatedAt,
		)
		if err != nil {
			return fmt.Errorf("insert ticket_issue %s: %w", issue.TicketNo, err)
		}
	}

	// 插入 checklists，并建立旧 ID 到新 ID 的映射
	checklistIDMap := map[int64]int64{}
	for _, c := range data.Checklists {
		items := c.Items
		if items == "" {
			items = "[]"
		}
		kind := c.Kind
		if kind != checklistKindDailyStart && kind != checklistKindIterationEnd {
			kind = checklistKindManual
		}
		result, err := tx.Exec(
			"INSERT INTO checklists (user_id, title, items, kind, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
			userID, c.Title, items, kind, c.CreatedAt, c.UpdatedAt,
		)
		if err != nil {
			return fmt.Errorf("insert checklist '%s': %w", c.Title, err)
		}
		newID, _ := result.LastInsertId()
		checklistIDMap[c.ID] = newID
	}

	// 插入每日与 Iteration 检查进度
	for _, run := range data.ChecklistRuns {
		newChecklistID, ok := checklistIDMap[run.ChecklistID]
		if !ok {
			log.Printf("WARNING: checklist_run %d references missing checklist %d, skipping", run.ID, run.ChecklistID)
			continue
		}
		completed := 0
		if run.Completed {
			completed = 1
		}
		_, err := tx.Exec(`INSERT INTO checklist_runs (
			user_id, checklist_id, kind, occurrence_key, iteration_number, title, items, data,
			completed, completed_at, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			userID, newChecklistID, run.Kind, run.OccurrenceKey, run.IterationNumber,
			run.Title, run.Items, run.Data, completed, run.CompletedAt, run.CreatedAt, run.UpdatedAt)
		if err != nil {
			return fmt.Errorf("insert checklist_run: %w", err)
		}
	}

	// 插入 checklist_snapshots
	for _, s := range data.ChecklistSnapshots {
		newChecklistID, ok := checklistIDMap[s.ChecklistID]
		if !ok {
			// M2: 记录跳过静默丢弃的 checklist_snapshot，便于调试数据不一致
			log.Printf("WARNING: checklist_snapshot %d references missing checklist %d, skipping", s.ID, s.ChecklistID)
			continue
		}
		data_ := s.Data
		if data_ == "" {
			data_ = "{}"
		}
		_, err := tx.Exec(
			"INSERT INTO checklist_snapshots (user_id, checklist_id, title, items_hash, data, created_at) VALUES (?, ?, ?, ?, ?, ?)",
			userID, newChecklistID, s.Title, s.ItemsHash, data_, s.CreatedAt,
		)
		if err != nil {
			return fmt.Errorf("insert checklist_snapshot: %w", err)
		}
	}

	// 插入 user_settings
	for key, value := range data.UserSettings {
		_, err := tx.Exec(
			"INSERT INTO user_settings (user_id, key, value) VALUES (?, ?, ?)",
			userID, key, value,
		)
		if err != nil {
			return fmt.Errorf("insert user_setting %s: %w", key, err)
		}
	}

	// 插入 iteration_overrides
	for _, o := range data.IterationOverrides {
		if o.StartDate == "" || o.EndDate == "" {
			continue
		}
		_, err := tx.Exec(
			"INSERT INTO iteration_overrides (user_id, iteration_number, start_date, end_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
			userID, o.IterationNumber, o.StartDate, o.EndDate, o.CreatedAt, o.UpdatedAt,
		)
		if err != nil {
			return fmt.Errorf("insert iteration_override: %w", err)
		}
	}

	for _, day := range data.HolidayCalendar {
		isWorkday := 0
		if day.IsWorkday {
			isWorkday = 1
		}
		_, err := tx.Exec(`INSERT INTO holiday_calendar_days
			(user_id, date, is_workday, name, source, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?)`, userID, day.Date, isWorkday, day.Name,
			day.Source, day.CreatedAt, day.UpdatedAt)
		if err != nil {
			return fmt.Errorf("insert holiday_calendar_day: %w", err)
		}
	}

	return nil
}

// snapshotFileName 生成快照文件名（纳秒精度避免同一秒冲突）
func snapshotFileName() string {
	now := time.Now().UTC().UnixNano()
	return fmt.Sprintf("snapshots/snapshot-%d.zip.enc", now)
}

// 建立导出快照并返回 hash，供 pull 前备份使用
func buildLocalBackupSnapshot(ctx context.Context, tx *sql.Tx, userID int64, encKey []byte) ([]byte, string, string, error) {
	data, err := buildExportData(ctx, tx, userID)
	if err != nil {
		return nil, "", "", err
	}
	encrypted, hash, err := buildEncryptedSnapshot(ctx, data, encKey)
	if err != nil {
		return nil, "", "", err
	}
	timestamp := time.Now().UnixNano()
	fileName := fmt.Sprintf("snapshots/backup-before-pull-%d.zip.enc", timestamp)
	return encrypted, hash, fileName, nil
}
