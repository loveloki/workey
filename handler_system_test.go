package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestHandleSystemVersion(t *testing.T) {
	t.Run("返回版本信息", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/version", nil)
		rr := httptest.NewRecorder()

		handleSystemVersion(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		assert.Equal(t, "application/json", rr.Header().Get("Content-Type"))

		var resp VersionResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.NotEmpty(t, resp.Commit)
	})

	t.Run("不允许 POST 方法", func(t *testing.T) {
		req := httptest.NewRequest("POST", "/api/version", nil)
		rr := httptest.NewRecorder()

		handleSystemVersion(rr, req)

		assert.Equal(t, http.StatusMethodNotAllowed, rr.Code)
	})

	t.Run("使用 version.json 文件", func(t *testing.T) {
		dir := t.TempDir()
		origDir, _ := os.Getwd()
		os.Chdir(dir)
		defer os.Chdir(origDir)

		os.WriteFile("version.json", []byte(`{"commit":"abc123","date":"2024-06-01","content":"test version"}`), 0644)

		req := httptest.NewRequest("GET", "/api/version", nil)
		rr := httptest.NewRecorder()

		handleSystemVersion(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var resp VersionResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.Equal(t, "abc123", resp.Commit)
	})
}
