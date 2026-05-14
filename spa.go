package main

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// SPA 前端静态文件服务

func handleSPA(w http.ResponseWriter, r *http.Request) {
	distDir := "./frontend/dist"

	path := filepath.Join(distDir, filepath.Clean(r.URL.Path))

	info, err := os.Stat(path)
	if err == nil && !info.IsDir() {
		// service worker 和 index.html 禁止缓存
		if strings.HasSuffix(path, "sw.js") || strings.HasSuffix(path, "index.html") {
			w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
		} else {
			// Vite 使用 content hash，静态资源可长期缓存
			w.Header().Set("Cache-Control", "public, max-age=31536000")
		}
		http.ServeFile(w, r, path)
		return
	}

	// SPA 回退：返回 index.html
	indexPath := filepath.Join(distDir, "index.html")
	if _, err := os.Stat(indexPath); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "api-only", "message": "Frontend not built. API available at /api/"})
		return
	}
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	http.ServeFile(w, r, indexPath)
}
