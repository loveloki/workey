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
		jsonBytes := []byte(`{"attendance":[{"date":"2024-07-01","clock_in":"2024-07-01 09:00:00","status":"normal"}],
            "work_logs":[{"date":"2024-07-01","content":"导入的日志"}],
            "ticket_issues":[{"ticket_no":"WO-IMPORT","occurred_on":"2024-07-01","cause_type":"operation","problem_description":"配置错误","cause_detail":"遗漏步骤"}],
            "checklists":[{"id":1,"title":"导入清单","items":"[]"}]}`)
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
const legacyDataFixture = `{
  "attendance": [{"id": 12, "user_id": 888, "date": "2020-03-02", "clock_in": "2020-03-02 08:45:00", "clock_out": null, "created_at": "2020-03-02 08:45:00", "updated_at": "2020-03-02 08:45:00"}],
  "work_logs": [{"id": 21, "user_id": 888, "date": "2020-03-02", "content": "旧版日志", "created_at": "2020-03-02 09:00:00", "updated_at": "2020-03-02 18:00:00"}],
  "todos": [{"id": 31, "user_id": 888, "content": "已完成的历史待办", "done": true, "created_at": "2020-03-02 09:30:00", "updated_at": "2020-03-03 18:00:00"}, {"content": "缺少新增可选字段"}],
  "checklists": [{"id": 41, "user_id": 888, "title": "旧版清单", "items": "[{\"text\":\"检查配置\"}]", "created_at": "2020-03-02 09:00:00", "updated_at": "2020-03-02 09:00:00"}],
  "checklist_snapshots": [{"id": 51, "user_id": 888, "checklist_id": 41, "title": "旧版快照", "items_hash": "oldhash", "data": "{\"checked\":[true],\"notes\":[\"完成\"],\"extras\":[]}", "created_at": "2020-03-02 10:00:00"}],
  "user_settings": {"timezone": "+8", "theme": "dark", "iteration_duration_days": "14"},
  "iteration_overrides": [{"id": 61, "user_id": 888, "iteration_number": 5, "start_date": "2020-03-02", "end_date": "2020-03-13", "created_at": "2020-03-01 09:00:00", "updated_at": "2020-03-01 10:00:00"}],
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
	created, updated := "2021-06-01 09:30:00", "2022-07-08T18:15:00Z"
	clockIn, clockOut := "2021-06-01 08:45:00", "2021-06-01 18:00:00"
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
		UserSettings:       map[string]string{"timezone": "+8", "kanban_url": "https://example.test/board", "theme": "dark", "iteration_start_date": "2021-06-01", "iteration_duration_days": "14", "iteration_workdays": "12", "reminder_delay": "8", "jwt_secret": "must-not-import", "password_hash": "must-not-import", "webdav_password": "must-not-import"},
		IterationOverrides: []IterationOverride{{ID: "301", UserID: "999", IterationNumber: 5, StartDate: "2021-06-01", EndDate: "2021-06-14", CreatedAt: created, UpdatedAt: updated}},
		HolidayCalendar:    []HolidayCalendarDay{{ID: "401", UserID: "999", Date: "2021-06-12", IsWorkday: true, Name: "调休", Source: "legacy", CreatedAt: created, UpdatedAt: updated}},
		ExportedAt:         "2022-07-09T12:00:00Z",
	}
}

func assertDataTimestampEqual(t *testing.T, expected, actual string) {
	t.Helper()
	parse := func(value string) time.Time {
		for _, layout := range []string{"2006-01-02 15:04:05", time.RFC3339Nano} {
			if parsed, err := time.Parse(layout, value); err == nil {
				return parsed
			}
		}
		t.Fatalf("Invalid test timestamp: %s", value)
		return time.Time{}
	}
	assert.True(t, parse(expected).Equal(parse(actual)), "%s != %s", expected, actual)
}

func TestDataImportLegacyFixture(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := createTestUser(t, "legacy-import", "password123")
	archive := makeDataTestArchive(t, dataArchiveTestEntry{"data.json", []byte(legacyDataFixture)})
	rr := importDataTestArchive(t, userID, archive)
	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())
	var response DataImportResponse
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &response))
	assert.Equal(t, 1, response.AttendanceCount)
	assert.Equal(t, 1, response.WorkLogCount)
	assert.Equal(t, 2, response.TodoCount)
	assert.Equal(t, 1, response.ChecklistCount)
	assert.Equal(t, 1, response.SnapshotCount)
	assert.Zero(t, response.TicketIssueCount)
	assert.Zero(t, response.CalendarDayCount)
	data, _ := exportDataTestFixture(t, userID)
	require.Len(t, data.Attendance, 1)
	assert.Equal(t, "normal", data.Attendance[0].Status)
	assert.False(t, data.Attendance[0].IsOvertime)
	assert.Nil(t, data.Attendance[0].ClockOut)
	assert.Equal(t, RecordID(userID), data.Attendance[0].UserID)
	assertDataTimestampEqual(t, "2020-03-02 08:45:00", data.Attendance[0].CreatedAt)
	assertDataTimestampEqual(t, "2020-03-02 18:00:00", data.WorkLogs[0].UpdatedAt)
	assert.Equal(t, "manual", data.Checklists[0].Kind)
	assert.NotEqual(t, RecordID("41"), data.Checklists[0].ID)
	assert.Equal(t, data.Checklists[0].ID, data.ChecklistSnapshots[0].ChecklistID)
	assert.Equal(t, "10", data.UserSettings["iteration_workdays"])
	assert.Equal(t, "14", data.UserSettings["iteration_duration_days"])
	require.Len(t, data.Todos, 2)
	assert.Empty(t, data.Todos[1].URL)
	assert.False(t, data.Todos[1].Done)
	assert.NotEmpty(t, data.Todos[1].CreatedAt)
	assert.Equal(t, data.Todos[1].CreatedAt, data.Todos[1].UpdatedAt)

	// 历史完成记录仍按原完成日期可见，不会因导入变成“今天完成”。
	req := createAuthenticatedRequest(t, http.MethodGet, "/api/workey/todos/completed-range?start=2020-03-03&end=2020-03-03", "", userID)
	history := httptest.NewRecorder()
	serveTest(history, req)
	require.Equal(t, http.StatusOK, history.Code)
	var todos TodoListResponse
	require.NoError(t, json.Unmarshal(history.Body.Bytes(), &todos))
	require.Len(t, todos.Todos, 1)
	assert.Equal(t, "已完成的历史待办", todos.Todos[0].Content)
	assertDataTimestampEqual(t, "2020-03-02 09:30:00", todos.Todos[0].CreatedAt)
	assertDataTimestampEqual(t, "2020-03-03 18:00:00", todos.Todos[0].UpdatedAt)
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

func TestDataImportLegacyChecklistKinds(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := createTestUser(t, "old-kinds", "password123")
	data := fullDataTestFixture()
	data.Checklists[0].Kind, data.Checklists[1].Kind = "daily_start", "iteration_end"
	rr := importDataTestFixture(t, userID, data)
	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())
	exported, _ := exportDataTestFixture(t, userID)
	require.Len(t, exported.Checklists, 2)
	for i := range exported.Checklists {
		assert.Equal(t, "manual", exported.Checklists[i].Kind)
		assert.Equal(t, exported.Checklists[i].ID, exported.ChecklistSnapshots[i].ChecklistID)
	}
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
		{"非法旧迭代周期", func(d *ExportData) { d.UserSettings["iteration_duration_days"] = "18446744073709551615" }},
		{"非法新迭代周期", func(d *ExportData) { d.UserSettings["iteration_workdays"] = "0" }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			cleanup := setupTestDB(t)
			defer cleanup()
			userID := createTestUser(t, "invalid-data", "password123")
			insertTestRecordAt(t, workLogCollection, userID, map[string]any{"date": "2021-06-01", "content": "原始数据"}, "2019-01-01 00:00:00", "2019-01-02 00:00:00")
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
			insertTestRecordAt(t, workLogCollection, userID, map[string]any{"date": "2021-06-01", "content": "不可改变"}, "2018-01-01 00:00:00", "2018-01-02 00:00:00")
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
	secondTodo.ID, secondTodo.CreatedAt, secondTodo.UpdatedAt = "32", "2021-06-02 09:30:00", "2022-07-09T18:15:00Z"
	exactTodo.ID = "33"
	openTodo.ID, openTodo.Done = "34", false
	data.Todos = append(data.Todos, secondTodo, exactTodo, openTodo)
	secondIssue, exactIssue := data.TicketIssues[0], data.TicketIssues[0]
	secondIssue.ID, secondIssue.CreatedAt, secondIssue.UpdatedAt = "42", "2021-06-02 09:30:00", "2022-07-09T18:15:00Z"
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

func TestDataImportRestoresOrphanedSnapshots(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := createTestUser(t, "orphan-snapshots", "password123")
	data := ExportData{
		ChecklistSnapshots: []ChecklistSnapshot{
			{ID: "1", UserID: "999", ChecklistID: "77", Title: "已删除模板的晚期快照", ItemsHash: "h1", Data: `{"checked":[true]}`, CreatedAt: "2021-06-02 12:00:00"},
			{ID: "2", UserID: "999", ChecklistID: "77", Title: "已删除模板的早期快照", ItemsHash: "h2", Data: `{"checked":[false]}`, CreatedAt: "2021-06-01 12:00:00"},
			{ID: "3", UserID: "999", ChecklistID: "88", Title: "另一个已删除模板", ItemsHash: "h3", Data: `{}`, CreatedAt: "2021-07-01 12:00:00"},
		},
	}
	// 有碰巧同名的正常模板时，占位恢复不能把快照绑过去或覆盖其条目。
	normalID := RecordID(insertTestRecordAt(t, checklistCollection, userID, map[string]any{"title": archivedChecklistTitlePrefix + "77", "items": `["正常模板"]`}, "2019-01-01 00:00:00", "2019-01-01 00:00:00").Id)
	rr := importDataTestFixture(t, userID, data)
	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())
	var response DataImportResponse
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &response))
	assert.Equal(t, 2, response.ChecklistCount)
	assert.Equal(t, 3, response.SnapshotCount)
	exported, archive := exportDataTestFixture(t, userID)
	require.Len(t, exported.Checklists, 3)
	require.Len(t, exported.ChecklistSnapshots, 3)
	assert.Equal(t, normalID, exported.Checklists[0].ID)
	assert.Equal(t, `["正常模板"]`, exported.Checklists[0].Items)
	for _, snapshot := range exported.ChecklistSnapshots {
		assert.NotEqual(t, normalID, snapshot.ChecklistID)
		assert.Equal(t, RecordID(userID), snapshot.UserID)
	}
	assert.Equal(t, exported.ChecklistSnapshots[0].ChecklistID, exported.ChecklistSnapshots[1].ChecklistID)
	assert.NotEqual(t, exported.ChecklistSnapshots[0].ChecklistID, exported.ChecklistSnapshots[2].ChecklistID)
	assertDataTimestampEqual(t, "2021-06-01 12:00:00", exported.Checklists[1].CreatedAt)
	assert.Equal(t, "[]", exported.Checklists[1].Items)
	assert.Equal(t, checklistKindManual, exported.Checklists[1].Kind)

	targetID := createTestUser(t, "orphan-roundtrip", "password123")
	rr = importDataTestArchive(t, targetID, archive)
	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())
	// 同一个旧备份和新版闭环备份重复导入，仍保持三模板与三条快照。
	rr = importDataTestFixture(t, userID, data)
	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())
	for _, id := range []string{userID, targetID} {
		actual, _ := exportDataTestFixture(t, id)
		require.Len(t, actual.Checklists, 3)
		require.Len(t, actual.ChecklistSnapshots, 3)
		for i, snapshot := range actual.ChecklistSnapshots {
			assert.Equal(t, RecordID(id), snapshot.UserID)
			assert.Equal(t, data.ChecklistSnapshots[i].Data, snapshot.Data)
			assertDataTimestampEqual(t, data.ChecklistSnapshots[i].CreatedAt, snapshot.CreatedAt)
			if i < 2 {
				assert.Equal(t, actual.Checklists[1].ID, snapshot.ChecklistID)
			} else {
				assert.Equal(t, actual.Checklists[2].ID, snapshot.ChecklistID)
			}
		}
	}
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

func TestDataImportLegacySnapshotJSONValues(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := createTestUser(t, "legacy-snapshot-values", "password123")
	data := ExportData{Checklists: []Checklist{{ID: "1", Title: "旧快照", Items: "[]"}}}
	for i, raw := range []string{"null", `[]`, `"旧备注"`, `true`, `123`, `{}`} {
		data.ChecklistSnapshots = append(data.ChecklistSnapshots, ChecklistSnapshot{
			ID: RecordID(strconv.Itoa(i + 1)), ChecklistID: "1", Title: "旧值", Data: raw, CreatedAt: "2020-01-01 12:00:00",
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
	archive := makeDataTestArchive(t, dataArchiveTestEntry{"data.json", []byte(legacyDataFixture)})
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

func TestPrepareDataImportPreservesLongLegacyIterations(t *testing.T) {
	data := ExportData{UserSettings: map[string]string{"iteration_duration_days": "365"}}
	require.NoError(t, prepareDataImport(&data, "1", "2020-01-01T00:00:00Z"))
	assert.Equal(t, "365", data.UserSettings["iteration_duration_days"])
	assert.Equal(t, "261", data.UserSettings["iteration_workdays"])
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

// testdata 中的 ZIP 由旧版生产二进制（PocketBase 改造前）真实导出，含已移除功能的 checklist_runs 键。
func TestDataImportLegacyProductionExport(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := createTestUser(t, "legacy-production", "password123")
	archive, err := os.ReadFile("testdata/legacy-production-export.zip")
	require.NoError(t, err)
	expected := DataImportResponse{Message: "Data imported successfully", AttendanceCount: 1, WorkLogCount: 2, TodoCount: 2,
		TicketIssueCount: 1, ChecklistCount: 2, SnapshotCount: 2, OverrideCount: 1, CalendarDayCount: 2}
	for attempt := 0; attempt < 2; attempt++ {
		rr := importDataTestArchive(t, userID, archive)
		require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())
		var response DataImportResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &response))
		assert.Equal(t, expected, response)
	}
	exported, _ := exportDataTestFixture(t, userID)
	assert.Len(t, exported.Todos, 2)
	assert.Len(t, exported.WorkLogs, 2)
	require.Len(t, exported.Checklists, 2)
	// 旧版删除清单后残留的快照恢复到占位清单。
	assert.Equal(t, archivedChecklistTitlePrefix+"2", exported.Checklists[1].Title)
	assert.Equal(t, exported.Checklists[1].ID, exported.ChecklistSnapshots[1].ChecklistID)
	assert.Equal(t, "dark", exported.UserSettings["theme"])
	assert.Equal(t, "8", exported.UserSettings["iteration_workdays"])
}
