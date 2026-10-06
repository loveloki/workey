package app

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/pocketbase/dbx"
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

func setTestAccountFields(t *testing.T, userID string, fields map[string]any) {
	t.Helper()
	account := testAccount(t, userID)
	for key, value := range fields {
		account.Set(key, value)
	}
	require.NoError(t, testApp.Save(account))
}

func countUserRecords(t *testing.T, collection, userID string) int {
	t.Helper()
	records, err := findUserRecords(testApp, collection, "", "", dbx.Params{"user": userID})
	require.NoError(t, err)
	return len(records)
}
