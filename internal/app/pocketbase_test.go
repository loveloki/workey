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

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPocketBaseWorkeyIntegration(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	register := httptest.NewRecorder()
	registerRequest := httptest.NewRequest(http.MethodPost, "/api/workey/auth/register",
		strings.NewReader(`{"username":"integration","password":"password123"}`))
	registerRequest.Header.Set("Content-Type", "application/json")
	serveTest(register, registerRequest)
	require.Equal(t, http.StatusOK, register.Code, register.Body.String())
	var auth AuthResponse
	require.NoError(t, json.Unmarshal(register.Body.Bytes(), &auth))
	require.NotEmpty(t, auth.Token)

	request := httptest.NewRequest(http.MethodPost, "/api/workey/todos",
		strings.NewReader(`{"content":"PocketBase 路由集成","url":""}`))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer "+auth.Token)
	created := httptest.NewRecorder()
	serveTest(created, request)
	require.Equal(t, http.StatusOK, created.Code, created.Body.String())
	var todo TodoResponse
	require.NoError(t, json.Unmarshal(created.Body.Bytes(), &todo))
	assert.Equal(t, auth.User.ID, todo.Todo.UserID)

	// 其他用户既看不到也改不了该记录。
	otherID := createTestUser(t, "otherintegration", "password123")
	other := httptest.NewRecorder()
	serveTest(other, createAuthenticatedRequest(t, http.MethodGet, "/api/workey/todos", "", otherID))
	require.Equal(t, http.StatusOK, other.Code)
	var list TodoListResponse
	require.NoError(t, json.Unmarshal(other.Body.Bytes(), &list))
	assert.Empty(t, list.Todos)
	update := httptest.NewRecorder()
	serveTest(update, createAuthenticatedRequest(t, http.MethodPut, "/api/workey/todos?id="+string(todo.Todo.ID), `{"done":true}`, otherID))
	assert.Equal(t, http.StatusNotFound, update.Code)

	// 原生 record API 对普通用户关闭。
	native := httptest.NewRequest(http.MethodGet, "/api/collections/todos/records", nil)
	native.Header.Set("Authorization", "Bearer "+auth.Token)
	nativeResponse := httptest.NewRecorder()
	serveTest(nativeResponse, native)
	assert.Equal(t, http.StatusForbidden, nativeResponse.Code)

	_, err := os.Stat(filepath.Join(testApp.DataDir(), "workey.db"))
	assert.True(t, os.IsNotExist(err), "不能生成独立的旧版数据库")
	_, err = os.Stat(filepath.Join(testApp.DataDir(), "data.db"))
	require.NoError(t, err)
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
	request := createAuthenticatedRequest(t, http.MethodPost, "/api/workey/data/import", "", userID)
	request.Body = io.NopCloser(&form)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	// 验证该路由覆盖 PocketBase 默认的 32 MiB 限额，仍接受旧备份允许的 50 MiB。
	request.ContentLength = 40 << 20
	response := httptest.NewRecorder()
	serveTest(response, request)
	assert.Equal(t, http.StatusOK, response.Code, response.Body.String())
}
