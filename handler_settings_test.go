package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestHandleSettings(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "settingsuser", "password123")

	t.Run("获取默认设置", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "GET", "/api/settings", "", userID)
		rr := httptest.NewRecorder()

		handleSettings(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var resp map[string]string
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.Equal(t, "+8", resp["timezone"])
		assert.Equal(t, "light", resp["theme"])
		assert.Equal(t, "14", resp["iteration_duration_days"])
	})

	t.Run("更新设置", func(t *testing.T) {
		body := `{"timezone":"+9","theme":"dark"}`
		req := createAuthenticatedRequest(t, "POST", "/api/settings", body, userID)
		rr := httptest.NewRecorder()

		handleSettings(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var resp map[string]string
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.Equal(t, "+9", resp["timezone"])
		assert.Equal(t, "dark", resp["theme"])
	})

	t.Run("更新后读取验证持久化", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "GET", "/api/settings", "", userID)
		rr := httptest.NewRecorder()

		handleSettings(rr, req)

		var resp map[string]string
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.Equal(t, "+9", resp["timezone"])
		assert.Equal(t, "dark", resp["theme"])
	})

	t.Run("更新所有设置", func(t *testing.T) {
		body := `{"timezone":"+0","theme":"auto","kanban_url":"https://custom.url","iteration_start_date":"2024-01-01","iteration_duration_days":"7"}`
		req := createAuthenticatedRequest(t, "POST", "/api/settings", body, userID)
		rr := httptest.NewRecorder()

		handleSettings(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var resp map[string]string
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.Equal(t, "+0", resp["timezone"])
		assert.Equal(t, "auto", resp["theme"])
		assert.Equal(t, "https://custom.url", resp["kanban_url"])
		assert.Equal(t, "2024-01-01", resp["iteration_start_date"])
		assert.Equal(t, "7", resp["iteration_duration_days"])
	})

	t.Run("PUT 方法不允许", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "PUT", "/api/settings", "", userID)
		rr := httptest.NewRecorder()

		handleSettings(rr, req)

		assert.Equal(t, http.StatusMethodNotAllowed, rr.Code)
	})

	t.Run("无效 JSON 请求体", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "POST", "/api/settings", "bad", userID)
		rr := httptest.NewRecorder()

		handleSettings(rr, req)

		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("更新后 GET 读取所有已保存设置", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "GET", "/api/settings", "", userID)
		rr := httptest.NewRecorder()

		handleSettings(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var resp map[string]string
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.Equal(t, "+0", resp["timezone"])
		assert.Equal(t, "auto", resp["theme"])
		assert.Equal(t, "https://custom.url", resp["kanban_url"])
		assert.Equal(t, "2024-01-01", resp["iteration_start_date"])
		assert.Equal(t, "7", resp["iteration_duration_days"])
	})
}
