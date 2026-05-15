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

func TestHandleSPA_NoFrontend(t *testing.T) {
	origDir, err := os.Getwd()
	require.NoError(t, err)
	os.Chdir(t.TempDir())
	defer os.Chdir(origDir)

	req := httptest.NewRequest("GET", "/", nil)
	rr := httptest.NewRecorder()

	handleSPA(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)

	var resp map[string]string
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	assert.Equal(t, "api-only", resp["status"])
}

func TestHandleSPA_NonExistentPath(t *testing.T) {
	req := httptest.NewRequest("GET", "/some/random/path", nil)
	rr := httptest.NewRecorder()

	handleSPA(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
}

func TestHandleSPA_WithDistDir(t *testing.T) {
	dir := t.TempDir()

	// 创建临时 dist 目录结构
	distDir := dir + "/frontend/dist"
	os.MkdirAll(distDir+"/assets", 0755)
	os.WriteFile(distDir+"/index.html", []byte("<html></html>"), 0644)
	os.WriteFile(distDir+"/sw.js", []byte("// sw"), 0644)
	os.WriteFile(distDir+"/assets/app.js", []byte("// app"), 0644)

	// 保存当前目录并切换到临时目录
	origDir, _ := os.Getwd()
	os.Chdir(dir)
	defer os.Chdir(origDir)

	t.Run("SPA 回退返回 index.html", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/nonexistent-page", nil)
		rr := httptest.NewRecorder()

		handleSPA(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		assert.Contains(t, rr.Header().Get("Cache-Control"), "no-cache")
	})

	t.Run("sw.js 禁止缓存", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/sw.js", nil)
		rr := httptest.NewRecorder()

		handleSPA(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		assert.Contains(t, rr.Header().Get("Cache-Control"), "no-cache")
	})

	t.Run("静态资源长期缓存", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/assets/app.js", nil)
		rr := httptest.NewRecorder()

		handleSPA(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		assert.Contains(t, rr.Header().Get("Cache-Control"), "max-age=31536000")
	})

	t.Run("SPA 回退到 index.html", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/dashboard", nil)
		rr := httptest.NewRecorder()

		handleSPA(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		assert.Contains(t, rr.Header().Get("Cache-Control"), "no-cache")
	})
}
