package app

import (
	"net/http"
	"os"
	"path"
	"strings"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/router"
)

// registerSPA 使用 PocketBase 的 apis.Static 提供前端构建产物，未知页面路径回退到 index.html。
// 未匹配的 /api/* 请求返回 JSON 404，不能落入 SPA 回退。
func registerSPA(r *router.Router[*core.RequestEvent]) {
	distDir := os.Getenv("WORKEY_FRONTEND_DIST")
	if distDir == "" {
		distDir = "./frontend/dist"
	}
	static := apis.Static(os.DirFS(distDir), true)
	r.Any("/{path...}", func(e *core.RequestEvent) error {
		method := e.Request.Method
		if strings.HasPrefix(e.Request.URL.Path, "/api/") || (method != http.MethodGet && method != http.MethodHead) {
			return e.NotFoundError("API endpoint not found", nil)
		}
		// Vite 资源带 content hash 可长期缓存；入口页与 service worker 等必须每次重新验证。
		if strings.HasPrefix(e.Request.URL.Path, "/assets/") && path.Base(e.Request.URL.Path) != "sw.js" {
			e.Response.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		} else {
			e.Response.Header().Set("Cache-Control", "no-cache")
		}
		return static(e)
	})
}
