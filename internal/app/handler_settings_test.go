package app

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
		req := createAuthenticatedRequest(t, "GET", "/api/workey/settings", "", userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var resp SettingsResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.Equal(t, "+8", resp.Timezone)
		assert.Equal(t, "light", resp.Theme)
		assert.Equal(t, "14", resp.IterationDurationDays)
	})

	t.Run("更新设置", func(t *testing.T) {
		body := `{"timezone":"+9","theme":"dark"}`
		req := createAuthenticatedRequest(t, "POST", "/api/workey/settings", body, userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var resp SettingsResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.Equal(t, "+9", resp.Timezone)
		assert.Equal(t, "dark", resp.Theme)
	})

	t.Run("更新后读取验证持久化", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "GET", "/api/workey/settings", "", userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		var resp SettingsResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.Equal(t, "+9", resp.Timezone)
		assert.Equal(t, "dark", resp.Theme)
	})

	t.Run("更新所有设置", func(t *testing.T) {
		body := `{"timezone":"+0","theme":"auto","iteration_start_date":"2024-01-01","iteration_duration_days":"7"}`
		req := createAuthenticatedRequest(t, "POST", "/api/workey/settings", body, userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var resp SettingsResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.Equal(t, "+0", resp.Timezone)
		assert.Equal(t, "auto", resp.Theme)
		assert.Equal(t, "2024-01-01", resp.IterationStartDate)
		assert.Equal(t, "7", resp.IterationDurationDays)
	})

	t.Run("提醒延迟默认值为 9", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "GET", "/api/workey/settings", "", userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		var resp SettingsResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.Equal(t, "9", resp.ReminderDelay)
	})

	t.Run("更新提醒延迟", func(t *testing.T) {
		body := `{"reminder_delay":"7"}`
		req := createAuthenticatedRequest(t, "POST", "/api/workey/settings", body, userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var resp SettingsResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.Equal(t, "7", resp.ReminderDelay)
	})

	t.Run("PUT 方法不允许", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "PUT", "/api/workey/settings", "", userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusNotFound, rr.Code)
	})

	t.Run("无效 JSON 请求体", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "POST", "/api/workey/settings", "bad", userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("更新后 GET 读取所有已保存设置", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "GET", "/api/workey/settings", "", userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var resp SettingsResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.Equal(t, "+0", resp.Timezone)
		assert.Equal(t, "auto", resp.Theme)
		assert.Equal(t, "2024-01-01", resp.IterationStartDate)
		assert.Equal(t, "7", resp.IterationDurationDays)
	})
}
