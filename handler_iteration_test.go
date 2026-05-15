package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestHandleIterationOverrides(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "iteruser", "password123")

	t.Run("创建迭代覆盖", func(t *testing.T) {
		body := `{"iteration_number":1,"start_date":"2024-01-01","end_date":"2024-01-14"}`
		req := createAuthenticatedRequest(t, "POST", "/api/iteration-overrides", body, userID)
		rr := httptest.NewRecorder()

		handleIterationOverrides(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var resp IterationOverrideResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.Equal(t, int64(1), resp.Override.IterationNumber)
		assert.Equal(t, "2024-01-01", resp.Override.StartDate)
	})

	t.Run("获取迭代覆盖列表", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "GET", "/api/iteration-overrides", "", userID)
		rr := httptest.NewRecorder()

		handleIterationOverrides(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var resp IterationOverrideListResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.Len(t, resp.Overrides, 1)
	})

	t.Run("更新已存在的迭代覆盖", func(t *testing.T) {
		body := `{"iteration_number":1,"start_date":"2024-01-08","end_date":"2024-01-21"}`
		req := createAuthenticatedRequest(t, "POST", "/api/iteration-overrides", body, userID)
		rr := httptest.NewRecorder()

		handleIterationOverrides(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var resp IterationOverrideResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.Equal(t, "2024-01-08", resp.Override.StartDate)
	})

	t.Run("删除迭代覆盖", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "DELETE", "/api/iteration-overrides?iteration_number=1", "", userID)
		rr := httptest.NewRecorder()

		handleIterationOverrides(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
	})

	t.Run("删除不存在的迭代覆盖", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "DELETE", "/api/iteration-overrides?iteration_number=99", "", userID)
		rr := httptest.NewRecorder()

		handleIterationOverrides(rr, req)

		assert.Equal(t, http.StatusNotFound, rr.Code)
	})

	t.Run("迭代号必须>=1", func(t *testing.T) {
		body := `{"iteration_number":0,"start_date":"2024-01-01","end_date":"2024-01-14"}`
		req := createAuthenticatedRequest(t, "POST", "/api/iteration-overrides", body, userID)
		rr := httptest.NewRecorder()

		handleIterationOverrides(rr, req)

		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("开始日期不能晚于结束日期", func(t *testing.T) {
		body := `{"iteration_number":2,"start_date":"2024-02-01","end_date":"2024-01-01"}`
		req := createAuthenticatedRequest(t, "POST", "/api/iteration-overrides", body, userID)
		rr := httptest.NewRecorder()

		handleIterationOverrides(rr, req)

		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("无效日期格式", func(t *testing.T) {
		body := `{"iteration_number":3,"start_date":"invalid","end_date":"2024-01-14"}`
		req := createAuthenticatedRequest(t, "POST", "/api/iteration-overrides", body, userID)
		rr := httptest.NewRecorder()

		handleIterationOverrides(rr, req)

		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("无效结束日期格式", func(t *testing.T) {
		body := `{"iteration_number":3,"start_date":"2024-01-01","end_date":"invalid"}`
		req := createAuthenticatedRequest(t, "POST", "/api/iteration-overrides", body, userID)
		rr := httptest.NewRecorder()

		handleIterationOverrides(rr, req)

		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("无效 JSON 请求体", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "POST", "/api/iteration-overrides", "bad", userID)
		rr := httptest.NewRecorder()

		handleIterationOverrides(rr, req)

		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("删除时缺少迭代号", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "DELETE", "/api/iteration-overrides", "", userID)
		rr := httptest.NewRecorder()

		handleIterationOverrides(rr, req)

		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("PATCH 方法不允许", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "PATCH", "/api/iteration-overrides", "", userID)
		rr := httptest.NewRecorder()

		handleIterationOverrides(rr, req)

		assert.Equal(t, http.StatusMethodNotAllowed, rr.Code)
	})
}
