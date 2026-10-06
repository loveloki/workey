package app

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestHandleDataExport(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "exportuser", "password123")

	// 创建全面的测试数据
	insertTestRecord(t, workLogCollection, userID, map[string]any{"date": "2024-06-01", "content": "测试日志"})
	insertTestRecord(t, attendanceCollection, userID, map[string]any{"date": "2024-06-01", "clock_in": "09:00", "status": "normal"})
	insertTestRecord(t, todoCollection, userID, map[string]any{"content": "待办"})
	insertTestRecord(t, ticketIssueCollection, userID, map[string]any{"ticket_no": "WO-1", "occurred_on": "2024-06-01", "cause_type": "code", "problem_description": "接口报错", "cause_detail": "边界未处理"})
	checklist := insertTestRecord(t, checklistCollection, userID, map[string]any{"title": "清单", "items": `[{"text":"检查"}]`})
	insertTestRecord(t, snapshotCollection, userID, map[string]any{"checklist": checklist.Id, "title": "清单快照", "items_hash": "hash", "data": "{}"})
	setTestAccountFields(t, userID, map[string]any{"theme": "dark"})
	insertTestRecord(t, iterationOverrideCollection, userID, map[string]any{"iteration_number": 1, "start_date": "2024-01-01", "end_date": "2024-01-14"})

	t.Run("导出数据为 ZIP", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "GET", "/api/workey/data/export", "", userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		assert.Equal(t, "application/zip", rr.Header().Get("Content-Type"))
		assert.Contains(t, rr.Header().Get("Content-Disposition"), "workey-export-")

		// 验证 ZIP 内容
		zr, err := zip.NewReader(bytes.NewReader(rr.Body.Bytes()), int64(rr.Body.Len()))
		require.NoError(t, err)
		require.Len(t, zr.File, 1)
		assert.Equal(t, "data.json", zr.File[0].Name)

		// 验证 JSON 数据
		rc, err := zr.File[0].Open()
		require.NoError(t, err)
		defer rc.Close()

		var data ExportData
		require.NoError(t, json.NewDecoder(rc).Decode(&data))
		assert.Len(t, data.WorkLogs, 1)
		assert.Equal(t, "测试日志", data.WorkLogs[0].Content)
		assert.Len(t, data.Attendance, 1)
		assert.Len(t, data.Todos, 1)
		assert.Len(t, data.TicketIssues, 1)
		assert.Equal(t, "WO-1", data.TicketIssues[0].TicketNo)
		assert.Len(t, data.Checklists, 1)
		assert.Equal(t, checklistKindManual, data.Checklists[0].Kind)
		assert.Len(t, data.ChecklistSnapshots, 1)
		assert.Equal(t, "dark", data.UserSettings["theme"])
		assert.Len(t, data.IterationOverrides, 1)
		assert.NotEmpty(t, data.ExportedAt)
	})

	t.Run("POST 方法不允许", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "POST", "/api/workey/data/export", "", userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusNotFound, rr.Code)
	})
}

func TestHandleDataDelete(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "deluser", "delpassword")

	// 插入测试数据
	insertTestRecord(t, workLogCollection, userID, map[string]any{"date": "2024-06-01", "content": "test"})
	insertTestRecord(t, ticketIssueCollection, userID, map[string]any{"ticket_no": "WO-DELETE", "occurred_on": "2024-06-01", "cause_type": "operation", "problem_description": "问题", "cause_detail": "操作遗漏"})
	checklist := insertTestRecord(t, checklistCollection, userID, map[string]any{"title": "清单"})
	insertTestRecord(t, snapshotCollection, userID, map[string]any{"checklist": checklist.Id, "data": "{}"})
	otherID := createTestUser(t, "deluser-other", "delpassword")
	insertTestRecord(t, workLogCollection, otherID, map[string]any{"date": "2024-06-01", "content": "保留"})

	t.Run("密码错误应拒绝删除", func(t *testing.T) {
		body := `{"password":"wrongpassword"}`
		req := createAuthenticatedRequest(t, "DELETE", "/api/workey/data/delete", body, userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusUnauthorized, rr.Code)
	})

	t.Run("密码正确应成功删除所有数据", func(t *testing.T) {
		body := `{"password":"delpassword"}`
		req := createAuthenticatedRequest(t, "DELETE", "/api/workey/data/delete", body, userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		// 验证数据已删除
		var resp DataDeleteResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.Equal(t, int64(1), resp.TicketIssueCount)

		for _, collection := range userDataCollections {
			assert.Zero(t, countUserRecords(t, collection, userID), collection)
		}
		assert.Equal(t, 1, countUserRecords(t, workLogCollection, otherID))
	})

	t.Run("缺少密码应返回错误", func(t *testing.T) {
		body := `{}`
		req := createAuthenticatedRequest(t, "DELETE", "/api/workey/data/delete", body, userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})
}

func TestHandleDataImport(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "importuser", "password123")

	t.Run("导入有效的 ZIP 文件", func(t *testing.T) {
		// 构造 ZIP 文件
		var buf bytes.Buffer
		zw := zip.NewWriter(&buf)
		fw, _ := zw.Create("data.json")
		jsonBytes := []byte(`{"attendance":[{"date":"2024-07-01","clock_in":"2024-07-01T09:00:00Z","status":"normal","created_at":"2024-07-01T09:00:00Z","updated_at":"2024-07-01T09:00:00Z"}],
            "work_logs":[{"date":"2024-07-01","content":"导入的日志","created_at":"2024-07-01T10:00:00Z","updated_at":"2024-07-01T18:00:00Z"}],
            "ticket_issues":[{"ticket_no":"WO-IMPORT","occurred_on":"2024-07-01","cause_type":"operation","problem_description":"配置错误","cause_detail":"遗漏步骤","created_at":"2024-07-01T11:00:00Z","updated_at":"2024-07-01T11:00:00Z"}],
            "checklists":[{"id":"r1list","title":"导入清单","items":"[]","kind":"manual","created_at":"2024-07-01T12:00:00Z","updated_at":"2024-07-01T12:00:00Z"}]}`)
		fw.Write(jsonBytes)
		zw.Close()

		// 构造 multipart 请求
		var body bytes.Buffer
		writer := multipart.NewWriter(&body)
		part, _ := writer.CreateFormFile("file", "test.zip")
		part.Write(buf.Bytes())
		writer.Close()

		req := createAuthenticatedRequest(t, "POST", "/api/workey/data/import", "", userID)
		req.Body = io.NopCloser(&body)
		req.Header.Set("Content-Type", writer.FormDataContentType())
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var resp DataImportResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.Equal(t, 1, resp.AttendanceCount)
		assert.Equal(t, 1, resp.WorkLogCount)
		assert.Equal(t, 1, resp.TicketIssueCount)
	})

	t.Run("无效 ZIP 文件", func(t *testing.T) {
		var body bytes.Buffer
		writer := multipart.NewWriter(&body)
		part, _ := writer.CreateFormFile("file", "bad.zip")
		part.Write([]byte("not a zip file"))
		writer.Close()

		req := createAuthenticatedRequest(t, "POST", "/api/workey/data/import", "", userID)
		req.Body = io.NopCloser(&body)
		req.Header.Set("Content-Type", writer.FormDataContentType())
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("ZIP 中无 data.json", func(t *testing.T) {
		var buf bytes.Buffer
		zw := zip.NewWriter(&buf)
		fw, _ := zw.Create("other.txt")
		fw.Write([]byte("hello"))
		zw.Close()

		var body bytes.Buffer
		writer := multipart.NewWriter(&body)
		part, _ := writer.CreateFormFile("file", "nodata.zip")
		part.Write(buf.Bytes())
		writer.Close()

		req := createAuthenticatedRequest(t, "POST", "/api/workey/data/import", "", userID)
		req.Body = io.NopCloser(&body)
		req.Header.Set("Content-Type", writer.FormDataContentType())
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("GET 方法不允许", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "GET", "/api/workey/data/import", "", userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusNotFound, rr.Code)
	})
}

func TestHandleDataExport_MethodNotAllowed(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "expmeth", "password123")

	req := createAuthenticatedRequest(t, "POST", "/api/workey/data/export", "", userID)
	rr := httptest.NewRecorder()

	serveTest(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestHandleDataImport_NoFile(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "impnofile", "password123")

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	writer.Close()

	req := createAuthenticatedRequest(t, "POST", "/api/workey/data/import", "", userID)
	req.Body = io.NopCloser(&body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	rr := httptest.NewRecorder()

	serveTest(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestHandleDataDelete_MethodNotAllowed(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "delmeth", "password123")

	req := createAuthenticatedRequest(t, "GET", "/api/workey/data/delete", "", userID)
	rr := httptest.NewRecorder()

	serveTest(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestHandleHistoryDateRange(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "histuser", "password123")

	t.Run("无数据时返回 null", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "GET", "/api/workey/history/date-range", "", userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var resp VersionRangeResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.Nil(t, resp.Earliest)
	})

	t.Run("有数据时返回日期范围", func(t *testing.T) {
		insertTestRecord(t, attendanceCollection, userID, map[string]any{"date": "2024-03-01", "status": "normal"})
		insertTestRecord(t, attendanceCollection, userID, map[string]any{"date": "2024-06-15", "status": "normal"})

		req := createAuthenticatedRequest(t, "GET", "/api/workey/history/date-range", "", userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var resp VersionRangeResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		require.NotNil(t, resp.Earliest)
		require.NotNil(t, resp.Latest)
		assert.Equal(t, "2024-03-01", *resp.Earliest)
		assert.Equal(t, "2024-06-15", *resp.Latest)
	})
}

// 固定旧版 data.json，而非用新版结构序列化，确保新增字段缺失时仍能恢复。
// dataFixtureJSON 是当前版本导出格式的最小备份：字符串 record ID、RFC3339 时间和 manual 清单。
const dataFixtureJSON = `{
  "attendance": [{"id": "r888att", "user_id": "r888user", "date": "2020-03-02", "clock_in": "2020-03-02T08:45:00Z", "clock_out": null, "status": "normal", "is_overtime": false, "created_at": "2020-03-02T08:45:00Z", "updated_at": "2020-03-02T08:45:00Z"}],
  "work_logs": [{"id": "r888log", "user_id": "r888user", "date": "2020-03-02", "content": "备份日志", "created_at": "2020-03-02T09:00:00Z", "updated_at": "2020-03-02T18:00:00Z"}],
  "todos": [{"id": "r888todo", "user_id": "r888user", "content": "已完成的历史待办", "url": "", "done": true, "created_at": "2020-03-02T09:30:00Z", "updated_at": "2020-03-03T18:00:00Z"}],
  "checklists": [{"id": "r888list", "user_id": "r888user", "title": "备份清单", "items": "[{\"text\":\"检查配置\"}]", "kind": "manual", "created_at": "2020-03-02T09:00:00Z", "updated_at": "2020-03-02T09:00:00Z"}],
  "checklist_snapshots": [{"id": "r888snap", "user_id": "r888user", "checklist_id": "r888list", "title": "备份快照", "items_hash": "hash", "data": "{\"checked\":[true],\"notes\":[\"完成\"],\"extras\":[]}", "created_at": "2020-03-02T10:00:00Z"}],
  "user_settings": {"timezone": "+8", "theme": "dark", "iteration_duration_days": "14", "iteration_workdays": "10"},
  "iteration_overrides": [{"id": "r888iter", "user_id": "r888user", "iteration_number": 5, "start_date": "2020-03-02", "end_date": "2020-03-13", "created_at": "2020-03-01T09:00:00Z", "updated_at": "2020-03-01T10:00:00Z"}],
  "holiday_calendar": [],
  "exported_at": "2020-03-15T12:00:00Z"
}`

type dataArchiveTestEntry struct {
	name string
	data []byte
}

func makeDataTestArchive(t *testing.T, entries ...dataArchiveTestEntry) []byte {
	t.Helper()
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	for _, entry := range entries {
		fw, err := zw.Create(entry.name)
		require.NoError(t, err)
		_, err = fw.Write(entry.data)
		require.NoError(t, err)
	}
	require.NoError(t, zw.Close())
	return buf.Bytes()
}

func importDataTestArchive(t *testing.T, userID string, archive []byte) *httptest.ResponseRecorder {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", "backup.zip")
	require.NoError(t, err)
	_, err = part.Write(archive)
	require.NoError(t, err)
	require.NoError(t, writer.Close())
	req := createAuthenticatedRequest(t, http.MethodPost, "/api/workey/data/import", "", userID)
	req.Body = io.NopCloser(&body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	rr := httptest.NewRecorder()
	serveTest(rr, req)
	return rr
}

func importDataTestFixture(t *testing.T, userID string, data ExportData) *httptest.ResponseRecorder {
	t.Helper()
	raw, err := json.Marshal(data)
	require.NoError(t, err)
	return importDataTestArchive(t, userID, makeDataTestArchive(t, dataArchiveTestEntry{"data.json", raw}))
}

func exportDataTestFixture(t *testing.T, userID string) (ExportData, []byte) {
	t.Helper()
	req := createAuthenticatedRequest(t, http.MethodGet, "/api/workey/data/export", "", userID)
	rr := httptest.NewRecorder()
	serveTest(rr, req)
	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())
	data, err := decodeDataArchive(rr.Body.Bytes())
	require.NoError(t, err)
	return data, rr.Body.Bytes()
}

func fullDataTestFixture() ExportData {
	created, updated := "2021-06-01T09:30:00Z", "2022-07-08T18:15:00Z"
	clockIn, clockOut := "2021-06-01T08:45:00Z", "2021-06-01T18:00:00Z"
	return ExportData{
		Attendance:   []Attendance{{ID: "11", UserID: "999", Date: "2021-06-01", ClockIn: &clockIn, ClockOut: &clockOut, Status: "business_trip", IsOvertime: true, CreatedAt: created, UpdatedAt: updated}},
		WorkLogs:     []WorkLog{{ID: "21", UserID: "999", Date: "2021-06-01", Content: "工作记录\n第二行", CreatedAt: created, UpdatedAt: updated}},
		Todos:        []Todo{{ID: "31", UserID: "999", Content: "历史待办", URL: "https://example.test/task", Done: true, CreatedAt: created, UpdatedAt: updated}},
		TicketIssues: []TicketIssue{{ID: "41", UserID: "999", TicketNo: "WO-HISTORY", TicketTitle: "历史问题", TicketURL: "https://example.test/issue", OccurredOn: "2021-06-01", CauseType: "code", ProblemDescription: "接口异常", CauseDetail: "缺少边界检查", Resolution: "增加测试", CreatedAt: created, UpdatedAt: updated}},
		Checklists: []Checklist{
			{ID: "101", UserID: "999", Title: "已存在清单", Items: `[{"text":"检查","nested":[1,true,null]}]`, Kind: "manual", CreatedAt: created, UpdatedAt: updated},
			{ID: "102", UserID: "999", Title: "新清单", Items: `["旧版字符串条目"]`, Kind: "manual", CreatedAt: created, UpdatedAt: updated},
		},
		ChecklistSnapshots: []ChecklistSnapshot{
			{ID: "201", UserID: "999", ChecklistID: "101", Title: "旧清单快照", ItemsHash: "hash-1", Data: `{"checked":[true],"notes":["通过"],"extras":[{"text":"额外项目"}]}`, CreatedAt: created},
			{ID: "202", UserID: "999", ChecklistID: "102", Title: "新清单快照", ItemsHash: "hash-2", Data: `{"checked":[false],"notes":["备注"],"extras":[]}`, CreatedAt: updated},
		},
		UserSettings:       map[string]string{"timezone": "+8", "theme": "dark", "iteration_start_date": "2021-06-01", "iteration_duration_days": "14", "iteration_workdays": "12", "reminder_delay": "8", "jwt_secret": "must-not-import", "password_hash": "must-not-import", "webdav_password": "must-not-import"},
		IterationOverrides: []IterationOverride{{ID: "301", UserID: "999", IterationNumber: 5, StartDate: "2021-06-01", EndDate: "2021-06-14", CreatedAt: created, UpdatedAt: updated}},
		HolidayCalendar:    []HolidayCalendarDay{{ID: "401", UserID: "999", Date: "2021-06-12", IsWorkday: true, Name: "调休", Source: "legacy", CreatedAt: created, UpdatedAt: updated}},
		ExportedAt:         "2022-07-09T12:00:00Z",
	}
}

func assertDataTimestampEqual(t *testing.T, expected, actual string) {
	t.Helper()
	expectedTime, err := parseImportTimestamp(expected)
	require.NoError(t, err)
	actualTime, err := parseImportTimestamp(actual)
	require.NoError(t, err)
	assert.True(t, expectedTime.Equal(actualTime), "%s != %s", expected, actual)
}

func TestDataImportKeepsHistoricalCompletionDates(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := createTestUser(t, "history-import", "password123")
	rr := importDataTestArchive(t, userID, makeDataTestArchive(t, dataArchiveTestEntry{"data.json", []byte(dataFixtureJSON)}))
	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())
	var response DataImportResponse
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &response))
	assert.Equal(t, 1, response.AttendanceCount)
	assert.Equal(t, 1, response.WorkLogCount)
	assert.Equal(t, 1, response.TodoCount)
	assert.Equal(t, 1, response.ChecklistCount)
	assert.Equal(t, 1, response.SnapshotCount)
	assert.Equal(t, 1, response.OverrideCount)
	assert.Zero(t, response.TicketIssueCount)
	assert.Zero(t, response.CalendarDayCount)

	data, _ := exportDataTestFixture(t, userID)
	require.Len(t, data.Attendance, 1)
	assert.Equal(t, RecordID(userID), data.Attendance[0].UserID)
	assertDataTimestampEqual(t, "2020-03-02T08:45:00Z", data.Attendance[0].CreatedAt)
	assertDataTimestampEqual(t, "2020-03-02T18:00:00Z", data.WorkLogs[0].UpdatedAt)
	assert.Equal(t, "manual", data.Checklists[0].Kind)
	assert.Equal(t, data.Checklists[0].ID, data.ChecklistSnapshots[0].ChecklistID)
	assert.Equal(t, "14", data.UserSettings["iteration_duration_days"])
	assert.Equal(t, "10", data.UserSettings["iteration_workdays"])

	// 历史完成记录仍按原完成日期可见，不会因导入变成“今天完成”。
	req := createAuthenticatedRequest(t, http.MethodGet, "/api/workey/todos/completed-range?start=2020-03-03&end=2020-03-03", "", userID)
	history := httptest.NewRecorder()
	serveTest(history, req)
	require.Equal(t, http.StatusOK, history.Code)
	var todos TodoListResponse
	require.NoError(t, json.Unmarshal(history.Body.Bytes(), &todos))
	require.Len(t, todos.Todos, 1)
	assert.Equal(t, "已完成的历史待办", todos.Todos[0].Content)
	var stored struct {
		Created string `db:"created"`
		Updated string `db:"updated"`
	}
	require.NoError(t, testApp.DB().NewQuery("SELECT created, updated FROM todos WHERE user = {:user} AND done = 1").
		Bind(dbx.Params{"user": userID}).One(&stored))
	assert.Equal(t, "2020-03-02 09:30:00.000Z", stored.Created)
	assert.Equal(t, "2020-03-03 18:00:00.000Z", stored.Updated)
}

func TestDataImportFullRoundTripAndDeduplication(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	sourceID := createTestUser(t, "roundtrip-source", "password123")
	targetID := createTestUser(t, "roundtrip-target", "password123")
	fixture := fullDataTestFixture()
	initial := importDataTestFixture(t, sourceID, fixture)
	require.Equal(t, http.StatusOK, initial.Code, initial.Body.String())
	// 导出只包含业务设置，账号的密码哈希/tokenKey 等字段绝不能出现在备份中。
	source, archive := exportDataTestFixture(t, sourceID)
	for _, key := range []string{"jwt_secret", "password_hash", "webdav_password"} {
		assert.NotContains(t, source.UserSettings, key)
	}
	for _, secret := range []string{"tokenKey", "password", testAccount(t, sourceID).TokenKey()} {
		assert.NotContains(t, string(archive), secret)
	}
	existingChecklistID := RecordID(insertTestRecord(t, checklistCollection, targetID, map[string]any{"title": "已存在清单", "items": "[]"}).Id)
	insertTestRecord(t, workLogCollection, targetID, map[string]any{"date": "2021-06-01", "content": "覆盖前"})

	for attempt := 0; attempt < 2; attempt++ {
		rr := importDataTestArchive(t, targetID, archive)
		require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())
		var response DataImportResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &response))
		assert.Equal(t, DataImportResponse{Message: "Data imported successfully", AttendanceCount: 1, WorkLogCount: 1, TodoCount: 1, TicketIssueCount: 1, ChecklistCount: 2, SnapshotCount: 2, OverrideCount: 1, CalendarDayCount: 1}, response)
	}
	target, _ := exportDataTestFixture(t, targetID)
	require.Len(t, target.Checklists, 2)
	require.Len(t, target.ChecklistSnapshots, 2)
	assert.Equal(t, existingChecklistID, target.Checklists[0].ID)
	for i := range target.Checklists {
		assert.Equal(t, target.Checklists[i].ID, target.ChecklistSnapshots[i].ChecklistID)
	}
	// 对所有数据类型逐字段比较；只有数据库生成 ID 和归属用户应发生变化。
	normalizeTime := func(value *string) {
		parsed, err := parseImportTimestamp(*value)
		require.NoError(t, err)
		*value = parsed.UTC().Format(time.RFC3339Nano)
	}
	for _, data := range []*ExportData{&source, &target, &fixture} {
		for i := range data.Attendance {
			normalizeTime(&data.Attendance[i].CreatedAt)
			normalizeTime(&data.Attendance[i].UpdatedAt)
			normalizeTime(data.Attendance[i].ClockIn)
			normalizeTime(data.Attendance[i].ClockOut)
			data.Attendance[i].ID, data.Attendance[i].UserID = "", ""
		}
		for i := range data.WorkLogs {
			normalizeTime(&data.WorkLogs[i].CreatedAt)
			normalizeTime(&data.WorkLogs[i].UpdatedAt)
			data.WorkLogs[i].ID, data.WorkLogs[i].UserID = "", ""
		}
		for i := range data.Todos {
			normalizeTime(&data.Todos[i].CreatedAt)
			normalizeTime(&data.Todos[i].UpdatedAt)
			data.Todos[i].ID, data.Todos[i].UserID = "", ""
		}
		for i := range data.TicketIssues {
			normalizeTime(&data.TicketIssues[i].CreatedAt)
			normalizeTime(&data.TicketIssues[i].UpdatedAt)
			data.TicketIssues[i].ID, data.TicketIssues[i].UserID = "", ""
		}
		for i := range data.Checklists {
			normalizeTime(&data.Checklists[i].CreatedAt)
			normalizeTime(&data.Checklists[i].UpdatedAt)
			data.Checklists[i].ID, data.Checklists[i].UserID = RecordID(strconv.Itoa(i+1)), ""
		}
		for i := range data.ChecklistSnapshots {
			normalizeTime(&data.ChecklistSnapshots[i].CreatedAt)
			data.ChecklistSnapshots[i].ID, data.ChecklistSnapshots[i].UserID, data.ChecklistSnapshots[i].ChecklistID = "", "", RecordID(strconv.Itoa(i+1))
		}
		for i := range data.IterationOverrides {
			normalizeTime(&data.IterationOverrides[i].CreatedAt)
			normalizeTime(&data.IterationOverrides[i].UpdatedAt)
			data.IterationOverrides[i].ID, data.IterationOverrides[i].UserID = "", ""
		}
		for i := range data.HolidayCalendar {
			normalizeTime(&data.HolidayCalendar[i].CreatedAt)
			normalizeTime(&data.HolidayCalendar[i].UpdatedAt)
			data.HolidayCalendar[i].ID, data.HolidayCalendar[i].UserID = "", ""
		}
		for key := range data.UserSettings {
			if !isSettingKey(key) {
				delete(data.UserSettings, key)
			}
		}
		data.ExportedAt = ""
	}
	assert.Equal(t, fixture, source)
	assert.Equal(t, source, target)
	assertDataTimestampEqual(t, fixture.Todos[0].CreatedAt, target.Todos[0].CreatedAt)
	assertDataTimestampEqual(t, fixture.Todos[0].UpdatedAt, target.Todos[0].UpdatedAt)
	assert.Equal(t, "12", target.UserSettings["iteration_workdays"])
	for _, collection := range userDataCollections {
		records, err := testApp.FindRecordsByFilter(collection, "user != {:a} && user != {:b}", "", 0, 0, dbx.Params{"a": sourceID, "b": targetID})
		require.NoError(t, err)
		assert.Empty(t, records, collection)
	}
}

func TestDataImportRejectsLegacyChecklistKinds(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := createTestUser(t, "old-kinds", "password123")
	for _, kind := range []string{"daily_start", "iteration_end"} {
		data := fullDataTestFixture()
		data.Checklists[0].Kind = kind
		rr := importDataTestFixture(t, userID, data)
		assert.Equal(t, http.StatusBadRequest, rr.Code, rr.Body.String())
	}
	assert.Zero(t, countUserRecords(t, checklistCollection, userID))
}

func TestDataImportInvalidRecordsAreAtomic(t *testing.T) {
	cases := []struct {
		name   string
		mutate func(*ExportData)
	}{
		{"非法考勤日期", func(d *ExportData) { d.Attendance[0].Date = "2021-02-30" }},
		{"未知考勤状态", func(d *ExportData) { d.Attendance[0].Status = "invalid" }},
		{"非法打卡时间", func(d *ExportData) { value := "not-time"; d.Attendance[0].ClockOut = &value }},
		{"空日志日期", func(d *ExportData) { d.WorkLogs[0].Date = "" }},
		{"空待办", func(d *ExportData) { d.Todos[0].Content, d.Todos[0].URL = "", "" }},
		{"非法历史时间", func(d *ExportData) { d.Todos[0].UpdatedAt = "yesterday" }},
		{"非法工单分类", func(d *ExportData) { d.TicketIssues[0].CauseType = "unknown" }},
		{"非法清单JSON", func(d *ExportData) { d.Checklists[1].Items = `{"not":"array"}` }},
		{"重复清单ID", func(d *ExportData) { d.Checklists[1].ID = d.Checklists[0].ID }},
		{"未知清单类型", func(d *ExportData) { d.Checklists[1].Kind = "unknown" }},
		{"非法快照引用", func(d *ExportData) { d.ChecklistSnapshots[1].ChecklistID = "" }},
		{"非法快照JSON", func(d *ExportData) { d.ChecklistSnapshots[1].Data = `{"checked":[],"checked":[true]}` }},
		{"反向迭代日期", func(d *ExportData) { d.IterationOverrides[0].EndDate = "2020-01-01" }},
		{"非法节假日日期", func(d *ExportData) { d.HolidayCalendar[0].Date = "2021-13-01" }},
		{"非法迭代周期天数", func(d *ExportData) { d.UserSettings["iteration_duration_days"] = "18446744073709551615" }},
		{"非法迭代工作日", func(d *ExportData) { d.UserSettings["iteration_workdays"] = "0" }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			cleanup := setupTestDB(t)
			defer cleanup()
			userID := createTestUser(t, "invalid-data", "password123")
			insertTestRecordAt(t, workLogCollection, userID, map[string]any{"date": "2021-06-01", "content": "原始数据"}, "2019-01-01T00:00:00Z", "2019-01-02T00:00:00Z")
			before, _ := exportDataTestFixture(t, userID)
			data := fullDataTestFixture()
			tc.mutate(&data)
			rr := importDataTestFixture(t, userID, data)
			assert.Equal(t, http.StatusBadRequest, rr.Code, rr.Body.String())
			after, _ := exportDataTestFixture(t, userID)
			before.ExportedAt, after.ExportedAt = "", ""
			assert.Equal(t, before, after)
		})
	}
}

func TestDataImportWriteErrorsRollbackEverything(t *testing.T) {
	for _, table := range []string{"checklists", "checklist_snapshots", "todos", "ticket_issues", "workey_accounts", "iteration_overrides", "holiday_calendar_days"} {
		t.Run(table, func(t *testing.T) {
			cleanup := setupTestDB(t)
			defer cleanup()
			userID := createTestUser(t, "rollback", "password123")
			insertTestRecordAt(t, workLogCollection, userID, map[string]any{"date": "2021-06-01", "content": "不可改变"}, "2018-01-01T00:00:00Z", "2018-01-02T00:00:00Z")
			before, _ := exportDataTestFixture(t, userID)
			// 用户设置保存在账号记录上，写入表现为 UPDATE。
			event := "INSERT"
			if table == accountCollection {
				event = "UPDATE"
			}
			rawTestExec(t, "CREATE TRIGGER fail_data_import BEFORE "+event+" ON "+table+" BEGIN SELECT RAISE(ABORT, 'forced write failure'); END")
			rr := importDataTestFixture(t, userID, fullDataTestFixture())
			assert.Equal(t, http.StatusInternalServerError, rr.Code, rr.Body.String())
			assert.Contains(t, rr.Body.String(), "no changes saved")
			after, _ := exportDataTestFixture(t, userID)
			before.ExportedAt, after.ExportedAt = "", ""
			assert.Equal(t, before, after)
		})
	}
}

func TestDataImportLookupErrorsAreNotTreatedAsMissing(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := createTestUser(t, "lookup-error", "password123")
	// 移除表强制查询报错，不能被误判成 sql.ErrNoRows 而继续导入其余记录。
	rawTestExec(t, "DROP TABLE checklists")
	rr := importDataTestFixture(t, userID, fullDataTestFixture())
	assert.Equal(t, http.StatusInternalServerError, rr.Code, rr.Body.String())
	for _, collection := range []string{attendanceCollection, workLogCollection, todoCollection, ticketIssueCollection} {
		assert.Zero(t, countUserRecords(t, collection, userID), collection)
	}
	assert.Empty(t, storedSettings(testAccount(t, userID)))
}

func TestDecodeDataArchiveRejectsUnsafeFilesAndJSON(t *testing.T) {
	cases := []struct {
		name    string
		entries []dataArchiveTestEntry
	}{
		{"重复data.json", []dataArchiveTestEntry{{"data.json", []byte(`{}`)}, {"data.json", []byte(`{}`)}}},
		{"重复大小写路径", []dataArchiveTestEntry{{"data.json", []byte(`{}`)}, {"DATA.JSON", []byte(`{}`)}}},
		{"相对路径", []dataArchiveTestEntry{{"../data.json", []byte(`{}`)}}},
		{"绝对路径", []dataArchiveTestEntry{{"/data.json", []byte(`{}`)}}},
		{"嵌套路径", []dataArchiveTestEntry{{"folder/data.json", []byte(`{}`)}}},
		{"Windows路径", []dataArchiveTestEntry{{`C:\data.json`, []byte(`{}`)}}},
		{"附加危险路径", []dataArchiveTestEntry{{"data.json", []byte(`{}`)}, {"../other", []byte(`bad`)}}},
		{"目录", []dataArchiveTestEntry{{"data.json/", nil}}},
		{"根null", []dataArchiveTestEntry{{"data.json", []byte(`null`)}}},
		{"null记录", []dataArchiveTestEntry{{"data.json", []byte(`{"todos":[null]}`)}}},
		{"null标量", []dataArchiveTestEntry{{"data.json", []byte(`{"todos":[{"content":"记录","done":null}]}`)}}},
		{"null设置", []dataArchiveTestEntry{{"data.json", []byte(`{"user_settings":{"theme":null}}`)}}},
		{"根数组", []dataArchiveTestEntry{{"data.json", []byte(`[]`)}}},
		{"尾随对象", []dataArchiveTestEntry{{"data.json", []byte(`{} {}`)}}},
		{"尾随垃圾", []dataArchiveTestEntry{{"data.json", []byte(`{} garbage`)}}},
		{"重复JSON键", []dataArchiveTestEntry{{"data.json", []byte(`{"todos":[],"todos":[]}`)}}},
		{"重复大小写JSON键", []dataArchiveTestEntry{{"data.json", []byte(`{"todos":[],"Todos":[]}`)}}},
		{"重复嵌套JSON键", []dataArchiveTestEntry{{"data.json", []byte(`{"user_settings":{"theme":"dark","theme":"light"}}`)}}},
		{"错误字段类型", []dataArchiveTestEntry{{"data.json", []byte(`{"todos":"not-array"}`)}}},
		{"未知JSON字段", []dataArchiveTestEntry{{"data.json", []byte(`{"users":[{"password_hash":"secret"}]}`)}}},
		{"非法UTF8", []dataArchiveTestEntry{{"data.json", []byte{'{', '"', 'x', '"', ':', '"', 0xff, '"', '}'}}}},
		{"过深JSON", []dataArchiveTestEntry{{"data.json", []byte(`{"x":` + strings.Repeat("[", 101) + strings.Repeat("]", 101) + `}`)}}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := decodeDataArchive(makeDataTestArchive(t, tc.entries...))
			require.Error(t, err)
		})
	}
}

func TestDataArchiveSizeLimits(t *testing.T) {
	t.Run("压缩文件超过50MB", func(t *testing.T) {
		_, err := decodeDataArchive(make([]byte, maxDataArchiveBytes+1))
		require.ErrorContains(t, err, "50MB")
	})
	t.Run("单个文件解压超过50MB", func(t *testing.T) {
		archive := makeDataTestArchive(t, dataArchiveTestEntry{"data.json", bytes.Repeat([]byte{' '}, int(maxDataArchiveBytes)+1)})
		_, err := decodeDataArchive(archive)
		require.ErrorContains(t, err, "50MB")
	})
	t.Run("所有文件累计解压超过50MB", func(t *testing.T) {
		archive := makeDataTestArchive(t,
			dataArchiveTestEntry{"data.json", []byte(`{}`)},
			dataArchiveTestEntry{"other.txt", bytes.Repeat([]byte{'a'}, int(maxDataArchiveBytes))})
		_, err := decodeDataArchive(archive)
		require.ErrorContains(t, err, "50MB")
	})
	t.Run("实际上传超过50MB", func(t *testing.T) {
		cleanup := setupTestDB(t)
		defer cleanup()
		userID := createTestUser(t, "oversized", "password123")
		rr := importDataTestArchive(t, userID, make([]byte, maxDataArchiveBytes+1))
		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})
}

func TestDataArchiveRejectsBadChecksumAndSymlink(t *testing.T) {
	var buf bytes.Buffer
	writer := zip.NewWriter(&buf)
	file, err := writer.CreateHeader(&zip.FileHeader{Name: "data.json", Method: zip.Store})
	require.NoError(t, err)
	_, err = file.Write([]byte(`{"todos":[]}`))
	require.NoError(t, err)
	require.NoError(t, writer.Close())
	archive := buf.Bytes()
	index := bytes.Index(archive, []byte(`{"todos":[]}`))
	require.GreaterOrEqual(t, index, 0)
	archive[index+2] = 'x'
	_, err = decodeDataArchive(archive)
	require.Error(t, err)

	buf.Reset()
	writer = zip.NewWriter(&buf)
	header := &zip.FileHeader{Name: "data.json", Method: zip.Store}
	header.SetMode(os.ModeSymlink | 0777)
	file, err = writer.CreateHeader(header)
	require.NoError(t, err)
	_, err = file.Write([]byte(`{}`))
	require.NoError(t, err)
	require.NoError(t, writer.Close())
	_, err = decodeDataArchive(buf.Bytes())
	require.Error(t, err)
}

type failingDataZipWriter struct{}

func (failingDataZipWriter) Write([]byte) (int, error) {
	return 0, errors.New("forced ZIP output error")
}

func TestWriteDataZipPropagatesErrors(t *testing.T) {
	require.Error(t, writeDataZip(failingDataZipWriter{}, &ExportData{}))
}

func TestDataImportPreservesDuplicateBusinessRecords(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := createTestUser(t, "duplicate-history", "password123")
	data := fullDataTestFixture()
	secondTodo, exactTodo, openTodo := data.Todos[0], data.Todos[0], data.Todos[0]
	secondTodo.ID, secondTodo.CreatedAt, secondTodo.UpdatedAt = "32", "2021-06-02T09:30:00Z", "2022-07-09T18:15:00Z"
	exactTodo.ID = "33"
	openTodo.ID, openTodo.Done = "34", false
	data.Todos = append(data.Todos, secondTodo, exactTodo, openTodo)
	secondIssue, exactIssue := data.TicketIssues[0], data.TicketIssues[0]
	secondIssue.ID, secondIssue.CreatedAt, secondIssue.UpdatedAt = "42", "2021-06-02T09:30:00Z", "2022-07-09T18:15:00Z"
	exactIssue.ID = "43"
	data.TicketIssues = append(data.TicketIssues, secondIssue, exactIssue)
	data.Checklists[1].Title = data.Checklists[0].Title
	exactChecklist := data.Checklists[0]
	exactChecklist.ID = "103"
	data.Checklists = append(data.Checklists, exactChecklist)
	thirdSnapshot := data.ChecklistSnapshots[0]
	thirdSnapshot.ID, thirdSnapshot.ChecklistID, thirdSnapshot.Title = "203", "103", "第三个模板快照"
	data.ChecklistSnapshots = append(data.ChecklistSnapshots, thirdSnapshot)
	// 同一个模板也可能有完全相同的多条快照，不能按字段去重而丢失源记录数量。
	exactSnapshot := data.ChecklistSnapshots[0]
	exactSnapshot.ID = "204"
	data.ChecklistSnapshots = append(data.ChecklistSnapshots, exactSnapshot)

	for attempt := 0; attempt < 2; attempt++ {
		rr := importDataTestFixture(t, userID, data)
		require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())
		exported, archive := exportDataTestFixture(t, userID)
		require.Len(t, exported.Todos, 4)
		require.Len(t, exported.TicketIssues, 3)
		require.Len(t, exported.Checklists, 3)
		require.Len(t, exported.ChecklistSnapshots, 4)
		for i, todo := range exported.Todos {
			assert.Equal(t, data.Todos[i].Content, todo.Content)
			assert.Equal(t, data.Todos[i].URL, todo.URL)
			assert.Equal(t, data.Todos[i].Done, todo.Done)
			assertDataTimestampEqual(t, data.Todos[i].CreatedAt, todo.CreatedAt)
			assertDataTimestampEqual(t, data.Todos[i].UpdatedAt, todo.UpdatedAt)
		}
		for i, issue := range exported.TicketIssues {
			assertDataTimestampEqual(t, data.TicketIssues[i].CreatedAt, issue.CreatedAt)
			assertDataTimestampEqual(t, data.TicketIssues[i].UpdatedAt, issue.UpdatedAt)
		}
		for i, checklist := range exported.Checklists {
			assert.Equal(t, data.Checklists[i].Title, checklist.Title)
			assert.Equal(t, data.Checklists[i].Items, checklist.Items)
			assert.Equal(t, checklist.ID, exported.ChecklistSnapshots[i].ChecklistID)
		}
		assert.Equal(t, exported.Checklists[0].ID, exported.ChecklistSnapshots[3].ChecklistID)
		// 再导入驱动标准化为 RFC3339 的备份，验证时间点等价而非原始字符串去重。
		rr = importDataTestArchive(t, userID, archive)
		require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())
	}
}

func TestDataImportRejectsOrphanedSnapshots(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := createTestUser(t, "orphan-snapshots", "password123")
	data := ExportData{
		Checklists: []Checklist{{ID: "1", Title: "清单", Items: "[]", Kind: checklistKindManual, CreatedAt: "2021-06-01T12:00:00Z", UpdatedAt: "2021-06-01T12:00:00Z"}},
		ChecklistSnapshots: []ChecklistSnapshot{
			{ID: "2", UserID: "999", ChecklistID: "77", Title: "未知模板的快照", Data: `{}`, CreatedAt: "2021-06-02T12:00:00Z"},
		},
	}
	rr := importDataTestFixture(t, userID, data)
	require.Equal(t, http.StatusBadRequest, rr.Code, rr.Body.String())
	assert.Contains(t, rr.Body.String(), "missing from the backup")
	assert.Zero(t, countUserRecords(t, checklistCollection, userID))
	assert.Zero(t, countUserRecords(t, snapshotCollection, userID))
}

func TestDataImportUpdateErrorsRollbackEverything(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := createTestUser(t, "rollback-update", "password123")
	insertTestRecord(t, checklistCollection, userID, map[string]any{"title": "已存在清单", "items": "[]"})
	before, _ := exportDataTestFixture(t, userID)
	rawTestExec(t, "CREATE TRIGGER fail_data_update BEFORE UPDATE ON checklists BEGIN SELECT RAISE(ABORT, 'forced update failure'); END")
	rr := importDataTestFixture(t, userID, fullDataTestFixture())
	assert.Equal(t, http.StatusInternalServerError, rr.Code, rr.Body.String())
	after, _ := exportDataTestFixture(t, userID)
	before.ExportedAt, after.ExportedAt = "", ""
	assert.Equal(t, before, after)
}

func TestDataImportCommitErrorsRollbackEverything(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := createTestUser(t, "rollback-commit", "password123")
	rawTestExec(t, "CREATE TABLE data_import_commit_guard (todo_id TEXT REFERENCES todos(id) DEFERRABLE INITIALLY DEFERRED)")
	rawTestExec(t, "CREATE TRIGGER fail_data_commit AFTER INSERT ON holiday_calendar_days BEGIN INSERT INTO data_import_commit_guard (todo_id) VALUES ('missing'); END")
	before, _ := exportDataTestFixture(t, userID)
	rr := importDataTestFixture(t, userID, fullDataTestFixture())
	assert.Equal(t, http.StatusInternalServerError, rr.Code, rr.Body.String())
	after, _ := exportDataTestFixture(t, userID)
	before.ExportedAt, after.ExportedAt = "", ""
	assert.Equal(t, before, after)
	var count int
	require.NoError(t, testApp.DB().NewQuery("SELECT COUNT(*) FROM data_import_commit_guard").Row(&count))
	assert.Zero(t, count)
}

func TestDataImportKeepsSnapshotJSONValues(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := createTestUser(t, "snapshot-values", "password123")
	data := ExportData{Checklists: []Checklist{{ID: "1", Title: "快照", Items: "[]", Kind: checklistKindManual, CreatedAt: "2020-01-01T11:00:00Z", UpdatedAt: "2020-01-01T11:00:00Z"}}}
	for i, raw := range []string{"null", `[]`, `"备注"`, `true`, `123`, `{}`} {
		data.ChecklistSnapshots = append(data.ChecklistSnapshots, ChecklistSnapshot{
			ID: RecordID(strconv.Itoa(i + 1)), ChecklistID: "1", Title: "值", Data: raw, CreatedAt: "2020-01-01T12:00:00Z",
		})
	}
	rr := importDataTestFixture(t, userID, data)
	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())
	exported, _ := exportDataTestFixture(t, userID)
	require.Len(t, exported.ChecklistSnapshots, len(data.ChecklistSnapshots))
	for i := range data.ChecklistSnapshots {
		assert.Equal(t, data.ChecklistSnapshots[i].Data, exported.ChecklistSnapshots[i].Data)
	}
}

func TestDataImportRejectsMultipleUploadedFiles(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := createTestUser(t, "multiple-archives", "password123")
	archive := makeDataTestArchive(t, dataArchiveTestEntry{"data.json", []byte(dataFixtureJSON)})
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for i := 0; i < 2; i++ {
		part, err := writer.CreateFormFile("file", "backup.zip")
		require.NoError(t, err)
		_, err = part.Write(archive)
		require.NoError(t, err)
	}
	require.NoError(t, writer.Close())
	req := createAuthenticatedRequest(t, http.MethodPost, "/api/workey/data/import", "", userID)
	req.Body = io.NopCloser(&body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	rr := httptest.NewRecorder()
	serveTest(rr, req)
	assert.Equal(t, http.StatusBadRequest, rr.Code)
	exported, _ := exportDataTestFixture(t, userID)
	assert.Empty(t, exported.WorkLogs)
	assert.Empty(t, exported.Todos)
}

func TestPrepareDataImportKeepsIterationDurationDays(t *testing.T) {
	// 自然日周期原样保存，工作日只在读取设置时按需换算。
	data := ExportData{UserSettings: map[string]string{"iteration_duration_days": "365"}}
	require.NoError(t, prepareDataImport(&data, "1"))
	assert.Equal(t, "365", data.UserSettings["iteration_duration_days"])
	assert.NotContains(t, data.UserSettings, "iteration_workdays")
}

func setTestAccountFields(t *testing.T, userID string, fields map[string]any) {
	t.Helper()
	account := testAccount(t, userID)
	for key, value := range fields {
		account.Set(key, value)
	}
	require.NoError(t, testApp.Save(account))
}

func insertTestRecordAt(t *testing.T, collection, userID string, fields map[string]any, created, updated string) *core.Record {
	t.Helper()
	record := insertTestRecord(t, collection, userID, fields)
	require.NoError(t, setImportTimestamps(testApp, record, created, updated))
	return record
}

func countUserRecords(t *testing.T, collection, userID string) int {
	t.Helper()
	records, err := findUserRecords(testApp, collection, "", "", dbx.Params{"user": userID})
	require.NoError(t, err)
	return len(records)
}

func rawTestExec(t *testing.T, query string) {
	t.Helper()
	_, err := testApp.DB().NewQuery(query).Execute()
	require.NoError(t, err)
}

// 旧版（PocketBase 改造前）的 ZIP 备份不再支持：数字 record ID、已下线的字段都会被拒绝。
func TestDecodeDataArchiveRejectsLegacyBackupFormat(t *testing.T) {
	cases := []struct {
		name string
		raw  string
	}{
		{"数字recordID", `{"todos":[{"id":31,"user_id":888,"content":"旧待办","done":false,"created_at":"2020-03-02T09:30:00Z","updated_at":"2020-03-02T09:30:00Z"}]}`},
		{"数字清单引用", `{"checklist_snapshots":[{"checklist_id":41,"title":"旧快照","data":"{}","created_at":"2020-03-02T10:00:00Z"}]}`},
		{"已下线的清单进度", `{"todos":[],"checklist_runs":[]}`},
		{"已移除的旧字段", `{"sync_state":{"cursor":"x"}}`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := decodeDataArchive(makeDataTestArchive(t, dataArchiveTestEntry{"data.json", []byte(tc.raw)}))
			require.Error(t, err)
		})
	}
}

// 旧版的时间格式、清单类型与孤立快照不再被兼容。
func TestPrepareDataImportRejectsLegacyBackupValues(t *testing.T) {
	created, updated := "2020-03-02T09:30:00Z", "2020-03-02T09:30:00Z"
	legacyCreated, legacyUpdated := "2020-03-02 09:30:00", "2020-03-02 09:30:00"
	legacyClock := "08:45"
	cases := []struct {
		name string
		data ExportData
	}{
		{"旧版时间格式", ExportData{Todos: []Todo{{Content: "旧待办", CreatedAt: legacyCreated, UpdatedAt: legacyUpdated}}}},
		{"缺少时间", ExportData{Todos: []Todo{{Content: "旧待办"}}}},
		{"旧版打卡时间", ExportData{Attendance: []Attendance{{Date: "2020-03-02", Status: "normal", ClockIn: &legacyClock, CreatedAt: created, UpdatedAt: updated}}}},
		{"旧版清单类型", ExportData{Checklists: []Checklist{{Title: "清单", Items: "[]", Kind: "daily_start", CreatedAt: created, UpdatedAt: updated}}}},
		{"孤立快照", ExportData{ChecklistSnapshots: []ChecklistSnapshot{{ChecklistID: "77", Data: "{}", CreatedAt: created}}}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			data := tc.data
			require.Error(t, prepareDataImport(&data, "1"))
		})
	}
}
