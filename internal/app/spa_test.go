package app

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSPAAndUnknownAPIRoutes(t *testing.T) {
	distDir := t.TempDir()
	require.NoError(t, os.MkdirAll(filepath.Join(distDir, "assets"), 0755))
	require.NoError(t, os.WriteFile(filepath.Join(distDir, "index.html"), []byte("<html>workey</html>"), 0644))
	require.NoError(t, os.WriteFile(filepath.Join(distDir, "sw.js"), []byte("// sw"), 0644))
	require.NoError(t, os.WriteFile(filepath.Join(distDir, "assets", "app.js"), []byte("// app"), 0644))
	t.Setenv("WORKEY_FRONTEND_DIST", distDir)
	cleanup := setupTestDB(t)
	defer cleanup()

	get := func(method, path string) *httptest.ResponseRecorder {
		rr := httptest.NewRecorder()
		serveTest(rr, httptest.NewRequest(method, path, nil))
		return rr
	}

	for _, path := range []string{"/", "/dashboard", "/settings/data"} {
		rr := get(http.MethodGet, path)
		assert.Equal(t, http.StatusOK, rr.Code, path)
		assert.Contains(t, rr.Body.String(), "workey", path)
		assert.Equal(t, "no-cache", rr.Header().Get("Cache-Control"), path)
	}
	sw := get(http.MethodGet, "/sw.js")
	assert.Equal(t, http.StatusOK, sw.Code)
	assert.Equal(t, "no-cache", sw.Header().Get("Cache-Control"))
	asset := get(http.MethodGet, "/assets/app.js")
	assert.Equal(t, http.StatusOK, asset.Code)
	assert.Contains(t, asset.Header().Get("Cache-Control"), "max-age=31536000")

	// 未知 API 与不支持的方法返回 JSON 404，而不是 SPA 页面。
	for _, req := range [][2]string{{http.MethodGet, "/api/not-a-workey-endpoint"}, {http.MethodGet, "/api/workey/nope"},
		{http.MethodPost, "/api/workey/auth/me"}, {http.MethodPost, "/dashboard"}} {
		rr := get(req[0], req[1])
		assert.Equal(t, http.StatusNotFound, rr.Code, req)
		assert.Contains(t, rr.Header().Get("Content-Type"), "application/json", req)
	}
	// PocketBase 系统路由不受影响。
	assert.Equal(t, http.StatusOK, get(http.MethodGet, "/api/health").Code)
}
