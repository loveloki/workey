package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestHandleLesson(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "lessonuser", "password123")

	t.Run("创建经验教训", func(t *testing.T) {
		body := `{"date":"2024-06-01","content":"学到了新知识"}`
		req := createAuthenticatedRequest(t, "POST", "/api/lessons", body, userID)
		rr := httptest.NewRecorder()

		handleLessons(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var resp map[string]interface{}
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		lesson := resp["lesson"].(map[string]interface{})
		assert.Equal(t, "学到了新知识", lesson["content"])
	})

	t.Run("Upsert 同日期", func(t *testing.T) {
		body := `{"date":"2024-06-01","content":"更新后的教训"}`
		req := createAuthenticatedRequest(t, "POST", "/api/lessons", body, userID)
		rr := httptest.NewRecorder()

		handleLessons(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var resp map[string]interface{}
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		lesson := resp["lesson"].(map[string]interface{})
		assert.Equal(t, "更新后的教训", lesson["content"])
	})

	t.Run("获取今日教训", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "GET", "/api/lessons/today", "", userID)
		rr := httptest.NewRecorder()

		handleLessonToday(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
	})

	t.Run("查询范围教训", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "GET", "/api/lessons/range?start=2024-01-01&end=2024-12-31", "", userID)
		rr := httptest.NewRecorder()

		handleLessonRange(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var resp map[string]interface{}
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		lessons := resp["lessons"].([]interface{})
		assert.Len(t, lessons, 1)
	})

	t.Run("GET 方法不允许", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "GET", "/api/lessons", "", userID)
		rr := httptest.NewRecorder()

		handleLessons(rr, req)

		assert.Equal(t, http.StatusMethodNotAllowed, rr.Code)
	})

	t.Run("范围查询缺少参数", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "GET", "/api/lessons/range", "", userID)
		rr := httptest.NewRecorder()

		handleLessonRange(rr, req)

		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("POST 无效 JSON", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "POST", "/api/lessons", "bad", userID)
		rr := httptest.NewRecorder()

		handleLessons(rr, req)

		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("不指定日期默认使用今天", func(t *testing.T) {
		body := `{"content":"今天的教训"}`
		req := createAuthenticatedRequest(t, "POST", "/api/lessons", body, userID)
		rr := httptest.NewRecorder()

		handleLessons(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
	})

	t.Run("POST 方法获取今日不允许", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "POST", "/api/lessons/today", "", userID)
		rr := httptest.NewRecorder()

		handleLessonToday(rr, req)

		assert.Equal(t, http.StatusMethodNotAllowed, rr.Code)
	})

	t.Run("POST 方法获取范围不允许", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "POST", "/api/lessons/range?start=2024-01-01&end=2024-12-31", "", userID)
		rr := httptest.NewRecorder()

		handleLessonRange(rr, req)

		assert.Equal(t, http.StatusMethodNotAllowed, rr.Code)
	})
}
