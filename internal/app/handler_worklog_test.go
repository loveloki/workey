package app

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestHandleWorkLog(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "wluser", "password123")

	t.Run("创建工作日志", func(t *testing.T) {
		body := `{"date":"2024-06-01","content":"完成了功能开发"}`
		req := createAuthenticatedRequest(t, "POST", "/api/workey/work-logs", body, userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var resp WorkLogResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		require.NotNil(t, resp.WorkLog)
		assert.Equal(t, "完成了功能开发", resp.WorkLog.Content)
	})

	t.Run("更新工作日志（同日期 upsert）", func(t *testing.T) {
		body := `{"date":"2024-06-01","content":"更新了内容"}`
		req := createAuthenticatedRequest(t, "POST", "/api/workey/work-logs", body, userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var resp WorkLogResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		require.NotNil(t, resp.WorkLog)
		assert.Equal(t, "更新了内容", resp.WorkLog.Content)
	})

	t.Run("获取今日工作日志", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "GET", "/api/workey/work-logs/today", "", userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
	})

	t.Run("按范围查询工作日志", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "GET", "/api/workey/work-logs/range?start=2024-01-01&end=2024-12-31", "", userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var resp WorkLogListResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.Len(t, resp.WorkLogs, 1)
	})

	t.Run("GET 方法不允许", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "GET", "/api/workey/work-logs", "", userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusNotFound, rr.Code)
	})

	t.Run("范围查询缺少参数", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "GET", "/api/workey/work-logs/range", "", userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("POST 今日不允许", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "POST", "/api/workey/work-logs/today", "", userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusNotFound, rr.Code)
	})

	t.Run("POST 范围不允许", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "POST", "/api/workey/work-logs/range?start=2024-01-01&end=2024-12-31", "", userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusNotFound, rr.Code)
	})

	t.Run("无效 JSON 请求体", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "POST", "/api/workey/work-logs", "bad json", userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("不指定日期默认使用今天", func(t *testing.T) {
		body := `{"content":"今天的日志"}`
		req := createAuthenticatedRequest(t, "POST", "/api/workey/work-logs", body, userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var resp WorkLogResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		require.NotNil(t, resp.WorkLog)
		assert.Equal(t, today(), resp.WorkLog.Date)
	})
}
