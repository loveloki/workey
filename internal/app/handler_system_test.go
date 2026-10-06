package app

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
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := createTestUser(t, "versionuser", "password123")

	get := func() VersionResponse {
		rr := httptest.NewRecorder()
		serveTest(rr, createAuthenticatedRequest(t, "GET", "/api/workey/system/version", "", userID))
		require.Equal(t, http.StatusOK, rr.Code)
		var resp VersionResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		return resp
	}

	t.Run("返回版本信息", func(t *testing.T) {
		assert.NotEmpty(t, get().Commit)
	})

	t.Run("使用 version.json 文件", func(t *testing.T) {
		t.Chdir(t.TempDir())
		require.NoError(t, os.WriteFile("version.json", []byte(`{"commit":"abc123","date":"2024-06-01","content":"test version"}`), 0644))
		assert.Equal(t, "abc123", get().Commit)
	})

	t.Run("需要登录", func(t *testing.T) {
		rr := httptest.NewRecorder()
		serveTest(rr, httptest.NewRequest("GET", "/api/workey/system/version", nil))
		assert.Equal(t, http.StatusUnauthorized, rr.Code)
	})
}
