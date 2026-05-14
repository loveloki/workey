package main

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestHandleDataExport(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "exportuser", "password123")

	// 创建全面的测试数据
	db.Exec("INSERT INTO work_logs (user_id, date, content, created_at, updated_at) VALUES (?, '2024-06-01', '测试日志', datetime('now'), datetime('now'))", userID)
	db.Exec("INSERT INTO attendance (user_id, date, clock_in, status, is_overtime, created_at, updated_at) VALUES (?, '2024-06-01', '09:00', 'normal', 0, datetime('now'), datetime('now'))", userID)
	db.Exec("INSERT INTO lessons (user_id, date, content, created_at, updated_at) VALUES (?, '2024-06-01', '教训内容', datetime('now'), datetime('now'))", userID)
	db.Exec("INSERT INTO todos (user_id, content, url, created_at, updated_at) VALUES (?, '待办', '', datetime('now'), datetime('now'))", userID)
	db.Exec("INSERT INTO checklists (user_id, title, items, created_at, updated_at) VALUES (?, '清单', '[]', datetime('now'), datetime('now'))", userID)
	db.Exec("INSERT INTO user_settings (user_id, key, value) VALUES (?, 'theme', 'dark')", userID)
	db.Exec("INSERT INTO iteration_overrides (user_id, iteration_number, start_date, end_date, created_at, updated_at) VALUES (?, 1, '2024-01-01', '2024-01-14', datetime('now'), datetime('now'))", userID)

	t.Run("导出数据为 ZIP", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "GET", "/api/data/export", "", userID)
		rr := httptest.NewRecorder()

		handleDataExport(rr, req)

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
		assert.Len(t, data.Lessons, 1)
		assert.Len(t, data.Todos, 1)
		assert.Len(t, data.Checklists, 1)
		assert.Equal(t, "dark", data.UserSettings["theme"])
		assert.Len(t, data.IterationOverrides, 1)
		assert.NotEmpty(t, data.ExportedAt)
	})

	t.Run("POST 方法不允许", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "POST", "/api/data/export", "", userID)
		rr := httptest.NewRecorder()

		handleDataExport(rr, req)

		assert.Equal(t, http.StatusMethodNotAllowed, rr.Code)
	})
}

func TestHandleDataDelete(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "deluser", "delpassword")

	// 插入测试数据
	db.Exec("INSERT INTO work_logs (user_id, date, content, created_at, updated_at) VALUES (?, '2024-06-01', 'test', datetime('now'), datetime('now'))", userID)

	t.Run("密码错误应拒绝删除", func(t *testing.T) {
		body := `{"password":"wrongpassword"}`
		req := createAuthenticatedRequest(t, "DELETE", "/api/data/delete", body, userID)
		rr := httptest.NewRecorder()

		handleDataDelete(rr, req)

		assert.Equal(t, http.StatusUnauthorized, rr.Code)
	})

	t.Run("密码正确应成功删除所有数据", func(t *testing.T) {
		body := `{"password":"delpassword"}`
		req := createAuthenticatedRequest(t, "DELETE", "/api/data/delete", body, userID)
		rr := httptest.NewRecorder()

		handleDataDelete(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		// 验证数据已删除
		var count int
		db.QueryRow("SELECT COUNT(*) FROM work_logs WHERE user_id = ?", userID).Scan(&count)
		assert.Equal(t, 0, count)
	})

	t.Run("缺少密码应返回错误", func(t *testing.T) {
		body := `{}`
		req := createAuthenticatedRequest(t, "DELETE", "/api/data/delete", body, userID)
		rr := httptest.NewRecorder()

		handleDataDelete(rr, req)

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
		importData := map[string]interface{}{
			"attendance": []map[string]interface{}{
				{"date": "2024-07-01", "clock_in": "2024-07-01 09:00:00", "status": "normal"},
			},
			"work_logs": []map[string]interface{}{
				{"date": "2024-07-01", "content": "导入的日志"},
			},
			"lessons": []map[string]interface{}{
				{"date": "2024-07-01", "content": "导入的教训"},
			},
			"checklists": []map[string]interface{}{
				{"id": 1, "title": "导入清单", "items": "[]"},
			},
		}
		jsonBytes, _ := json.Marshal(importData)
		fw.Write(jsonBytes)
		zw.Close()

		// 构造 multipart 请求
		var body bytes.Buffer
		writer := multipart.NewWriter(&body)
		part, _ := writer.CreateFormFile("file", "test.zip")
		part.Write(buf.Bytes())
		writer.Close()

		req := createAuthenticatedRequest(t, "POST", "/api/data/import", "", userID)
		req.Body = io.NopCloser(&body)
		req.Header.Set("Content-Type", writer.FormDataContentType())
		rr := httptest.NewRecorder()

		handleDataImport(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var resp map[string]interface{}
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.Equal(t, float64(1), resp["attendance_count"])
		assert.Equal(t, float64(1), resp["work_log_count"])
		assert.Equal(t, float64(1), resp["lesson_count"])
	})

	t.Run("无效 ZIP 文件", func(t *testing.T) {
		var body bytes.Buffer
		writer := multipart.NewWriter(&body)
		part, _ := writer.CreateFormFile("file", "bad.zip")
		part.Write([]byte("not a zip file"))
		writer.Close()

		req := createAuthenticatedRequest(t, "POST", "/api/data/import", "", userID)
		req.Body = io.NopCloser(&body)
		req.Header.Set("Content-Type", writer.FormDataContentType())
		rr := httptest.NewRecorder()

		handleDataImport(rr, req)

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

		req := createAuthenticatedRequest(t, "POST", "/api/data/import", "", userID)
		req.Body = io.NopCloser(&body)
		req.Header.Set("Content-Type", writer.FormDataContentType())
		rr := httptest.NewRecorder()

		handleDataImport(rr, req)

		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("GET 方法不允许", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "GET", "/api/data/import", "", userID)
		rr := httptest.NewRecorder()

		handleDataImport(rr, req)

		assert.Equal(t, http.StatusMethodNotAllowed, rr.Code)
	})
}

func TestHandleDataExport_MethodNotAllowed(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "expmeth", "password123")

	req := createAuthenticatedRequest(t, "POST", "/api/data/export", "", userID)
	rr := httptest.NewRecorder()

	handleDataExport(rr, req)

	assert.Equal(t, http.StatusMethodNotAllowed, rr.Code)
}

func TestHandleDataImport_NoFile(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "impnofile", "password123")

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	writer.Close()

	req := createAuthenticatedRequest(t, "POST", "/api/data/import", "", userID)
	req.Body = io.NopCloser(&body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	rr := httptest.NewRecorder()

	handleDataImport(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestHandleDataDelete_MethodNotAllowed(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "delmeth", "password123")

	req := createAuthenticatedRequest(t, "GET", "/api/data/delete", "", userID)
	rr := httptest.NewRecorder()

	handleDataDelete(rr, req)

	assert.Equal(t, http.StatusMethodNotAllowed, rr.Code)
}

func TestHandleHistoryDateRange(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "histuser", "password123")

	t.Run("无数据时返回 null", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "GET", "/api/history/date-range", "", userID)
		rr := httptest.NewRecorder()

		handleHistoryDateRange(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var resp map[string]interface{}
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.Nil(t, resp["earliest"])
	})

	t.Run("有数据时返回日期范围", func(t *testing.T) {
		db.Exec("INSERT INTO attendance (user_id, date, status, created_at, updated_at) VALUES (?, '2024-03-01', 'normal', datetime('now'), datetime('now'))", userID)
		db.Exec("INSERT INTO attendance (user_id, date, status, created_at, updated_at) VALUES (?, '2024-06-15', 'normal', datetime('now'), datetime('now'))", userID)

		req := createAuthenticatedRequest(t, "GET", "/api/history/date-range", "", userID)
		rr := httptest.NewRecorder()

		handleHistoryDateRange(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var resp map[string]interface{}
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.Equal(t, "2024-03-01", resp["earliest"])
		assert.Equal(t, "2024-06-15", resp["latest"])
	})
}
