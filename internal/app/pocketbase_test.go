package app

import (
	"bytes"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func testPocketBaseRouter(t *testing.T) http.Handler {
	t.Helper()
	r, err := apis.NewRouter(pbApp)
	require.NoError(t, err)
	registerPocketBaseRoutes(r)
	handler, err := r.BuildMux()
	require.NoError(t, err)
	return handler
}

func TestPocketBaseWorkeyIntegration(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	handler := testPocketBaseRouter(t)
	health := httptest.NewRecorder()
	handler.ServeHTTP(health, httptest.NewRequest(http.MethodGet, "/api/health", nil))
	assert.Equal(t, http.StatusOK, health.Code)

	register := httptest.NewRecorder()
	handler.ServeHTTP(register, httptest.NewRequest(http.MethodPost, "/api/auth/register",
		strings.NewReader(`{"username":"integration","password":"password123"}`)))
	require.Equal(t, http.StatusOK, register.Code, register.Body.String())
	var auth AuthResponse
	require.NoError(t, json.Unmarshal(register.Body.Bytes(), &auth))
	require.NotEmpty(t, auth.Token)
	assert.Positive(t, auth.User.ID)

	request := httptest.NewRequest(http.MethodPost, "/api/todos",
		strings.NewReader(`{"content":"PocketBase 路由集成","url":""}`))
	request.Header.Set("Authorization", "Bearer "+auth.Token)
	created := httptest.NewRecorder()
	handler.ServeHTTP(created, request)
	require.Equal(t, http.StatusOK, created.Code, created.Body.String())
	var todo TodoResponse
	require.NoError(t, json.Unmarshal(created.Body.Bytes(), &todo))
	assert.Equal(t, auth.User.ID, todo.Todo.UserID)

	otherID := createTestUser(t, "otherintegration", "password123")
	other := httptest.NewRecorder()
	handler.ServeHTTP(other, createAuthenticatedRequest(t, http.MethodGet, "/api/todos", "", otherID))
	require.Equal(t, http.StatusOK, other.Code)
	var list TodoListResponse
	require.NoError(t, json.Unmarshal(other.Body.Bytes(), &list))
	assert.Empty(t, list.Todos)

	unauthorized := httptest.NewRecorder()
	handler.ServeHTTP(unauthorized, httptest.NewRequest(http.MethodGet, "/api/todos", nil))
	assert.Equal(t, http.StatusUnauthorized, unauthorized.Code)
	unknown := httptest.NewRecorder()
	handler.ServeHTTP(unknown, httptest.NewRequest(http.MethodGet, "/api/not-a-workey-endpoint", nil))
	assert.Equal(t, http.StatusNotFound, unknown.Code)
	assert.Equal(t, "application/json", unknown.Header().Get("Content-Type"))

	for _, path := range extraRoutePaths {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, path, nil))
		assert.NotEqual(t, http.StatusNotFound, response.Code, "missing route %s", path)
		assert.Equal(t, "application/json", response.Header().Get("Content-Type"), path)
	}
	_, err := os.Stat(filepath.Join(dataDir, "workey.db"))
	assert.True(t, os.IsNotExist(err), "不能生成独立的旧版数据库")
	_, err = os.Stat(filepath.Join(dataDir, "data.db"))
	require.NoError(t, err)
}

func TestPocketBaseCORS(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	t.Setenv("WORKEY_ALLOWED_ORIGINS", "https://workey.exe.xyz")
	handler := testPocketBaseRouter(t)
	for _, origin := range []string{"https://workey.exe.xyz", "https://attacker.example"} {
		request := httptest.NewRequest(http.MethodOptions, "/api/todos", nil)
		request.Header.Set("Origin", origin)
		request.Header.Set("Access-Control-Request-Method", http.MethodGet)
		request.Header.Set("Access-Control-Request-Headers", "Authorization")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		assert.Equal(t, http.StatusNoContent, response.Code)
		if origin == "https://workey.exe.xyz" {
			assert.Equal(t, origin, response.Header().Get("Access-Control-Allow-Origin"))
			assert.Equal(t, "true", response.Header().Get("Access-Control-Allow-Credentials"))
		} else {
			assert.Empty(t, response.Header().Get("Access-Control-Allow-Origin"))
		}
	}
	// 无效的白名单不能触发 PocketBase 的默认通配符回退。
	t.Setenv("WORKEY_ALLOWED_ORIGINS", "*")
	handler = testPocketBaseRouter(t)
	request := httptest.NewRequest(http.MethodOptions, "/api/todos", nil)
	request.Header.Set("Origin", "https://attacker.example")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	assert.Empty(t, response.Header().Get("Access-Control-Allow-Origin"))
}

func TestPocketBaseImportBodyLimit(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := createTestUser(t, "uploadlimituser", "password123")
	var archive, form bytes.Buffer
	require.NoError(t, writeDataZip(&archive, &ExportData{}))
	writer := multipart.NewWriter(&form)
	part, err := writer.CreateFormFile("file", "legacy.zip")
	require.NoError(t, err)
	_, err = part.Write(archive.Bytes())
	require.NoError(t, err)
	require.NoError(t, writer.Close())
	request := createAuthenticatedRequest(t, http.MethodPost, "/api/data/import", "", userID)
	request.Body = io.NopCloser(&form)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	// 验证该路由覆盖原生默认 32 MiB 限额，仍接受旧备份允许的 50 MiB。
	request.ContentLength = 40 << 20
	response := httptest.NewRecorder()
	testPocketBaseRouter(t).ServeHTTP(response, request)
	assert.Equal(t, http.StatusOK, response.Code, response.Body.String())
}
