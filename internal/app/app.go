package app

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"
	"github.com/pocketbase/pocketbase/tools/router"
)

var db *database
var pbApp core.App
var dataEncryptionSecret []byte
var dataDir string

// New 创建可通过 PocketBase CLI 启动的 Workey 扩展应用。
func New(directory string) *pocketbase.PocketBase {
	pb := pocketbase.NewWithConfig(pocketbase.Config{DefaultDataDir: directory})
	migratecmd.MustRegister(pb, pb.RootCmd, migratecmd.Config{Automigrate: false})
	pb.OnBootstrap().BindFunc(func(e *core.BootstrapEvent) error {
		if err := e.Next(); err != nil {
			return err
		}
		if err := e.App.RunAppMigrations(); err != nil {
			return err
		}
		pbApp = e.App
		db = &database{app: e.App}
		dataDir = e.App.DataDir()
		if err := os.MkdirAll(filepath.Join(dataDir, "uploads"), 0755); err != nil {
			return err
		}
		secret, err := getOrCreateEncryptionSecret()
		if err != nil {
			return err
		}
		dataEncryptionSecret = secret
		return nil
	})
	syncManager := NewSyncManager()
	notifier := NewNotifier()
	pb.OnServe().BindFunc(func(e *core.ServeEvent) error {
		registerPocketBaseRoutes(e.Router)
		if err := e.Next(); err != nil {
			return err
		}
		syncManager.Start()
		notifier.Start()
		return nil
	})
	pb.OnTerminate().BindFunc(func(e *core.TerminateEvent) error {
		syncManager.Stop()
		notifier.Stop()
		return e.Next()
	})
	return pb
}

func allowedOrigins() []string {
	raw := os.Getenv("WORKEY_ALLOWED_ORIGINS")
	if raw == "" {
		raw = "https://workey.exe.xyz,https://pockethost.exe.xyz,http://localhost:3000,http://localhost:8000"
	}
	origins := []string{}
	for _, origin := range strings.Split(raw, ",") {
		origin = strings.TrimSpace(origin)
		// 携带代理登录 Cookie 时不允许通配符跨域来源。
		if origin != "" && !strings.ContainsAny(origin, "*?") {
			origins = append(origins, origin)
		}
	}
	return origins
}

func Run() error {
	if os.Getenv("WORKEY_DB") != "" {
		return fmt.Errorf("WORKEY_DB is no longer supported; export the old version and import its ZIP backup")
	}
	directory := os.Getenv("WORKEY_DATA")
	if directory == "" {
		directory = "./pb_data"
	}
	return New(directory).Start()
}

// registerRoutes 保留标准 HTTP 适配，方便直接测试业务 handler。
func registerRoutes(mux *http.ServeMux) {
	for path, handler := range workeyRoutes() {
		mux.HandleFunc(path, handler)
	}
	mux.Handle("/uploads/", http.StripPrefix("/uploads/", http.FileServer(http.Dir(filepath.Join(dataDir, "uploads")))))
	mux.HandleFunc("/", handleSPA)
}

func registerPocketBaseRoutes(r *router.Router[*core.RequestEvent]) {
	r.Unbind(apis.DefaultCorsMiddlewareId)
	r.Bind(apis.CORS(apis.CORSConfig{
		AllowOrigins: allowedOrigins(), AllowCredentials: true,
		AllowOriginFunc: func(origin string) (bool, error) { return isAllowedOrigin(origin), nil },
		AllowMethods:    []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:    []string{"Content-Type", "Authorization"}, ExposeHeaders: []string{"X-New-Token"},
	}))
	for path, handler := range workeyRoutes() {
		route := r.Any(path, apis.WrapStdHandler(handler))
		if path == "/api/data/import" {
			route.Bind(apis.BodyLimit(maxDataArchiveBytes + (1 << 20)))
		}
	}
	r.Any("/api/{path...}", apis.WrapStdHandler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		jsonError(w, "API endpoint not found", http.StatusNotFound)
	})))
	r.Any("/uploads/{path...}", apis.WrapStdHandler(http.StripPrefix("/uploads/", http.FileServer(http.Dir(filepath.Join(dataDir, "uploads"))))))
	r.Any("/{path...}", apis.WrapStdHandler(http.HandlerFunc(handleSPA)))
}

func workeyRoutes() map[string]http.HandlerFunc {
	routes := map[string]http.HandlerFunc{
		"/api/auth/register":  handleRegister,
		"/api/auth/login":     handleLogin,
		"/api/push/vapid-key": handleVapidKey,
	}
	protected := map[string]http.HandlerFunc{
		"/api/auth/me":               handleMe,
		"/api/auth/change-password":  handleChangePassword,
		"/api/attendance/clock-in":   handleClockIn,
		"/api/attendance/clock-out":  handleClockOut,
		"/api/attendance/leave":      handleLeave,
		"/api/attendance/today":      handleAttendanceToday,
		"/api/attendance/range":      handleAttendanceRange,
		"/api/attendance/stats":      handleAttendanceStats,
		"/api/attendance/overtime":   handleAttendanceOvertime,
		"/api/work-logs":             handleWorkLogs,
		"/api/work-logs/today":       handleWorkLogToday,
		"/api/work-logs/range":       handleWorkLogRange,
		"/api/todos/created-today":   handleCreatedTodayTodos,
		"/api/todos/completed-today": handleCompletedTodayTodos,
		"/api/todos/completed-range": handleCompletedRangeTodos,
		"/api/todos":                 handleTodos,
		"/api/ticket-issues":         handleTicketIssues,
		"/api/ticket-issues/stats":   handleTicketIssueStats,
		"/api/checklists":            handleChecklists,
		"/api/checklist-snapshots":   handleChecklistSnapshots,
		"/api/iterations":            handleIterations,
		"/api/iteration-overrides":   handleIterationOverrides,
		"/api/holiday-calendar":      handleHolidayCalendar,
		"/api/settings":              handleSettings,
		"/api/system/version":        handleSystemVersion,
		"/api/data/export":           handleDataExport,
		"/api/data/import":           handleDataImport,
		"/api/data/delete":           handleDataDelete,
		"/api/history/date-range":    handleHistoryDateRange,
		"/api/push/subscribe":        handlePushSubscribe,
	}
	for path, handler := range protected {
		routes[path] = authMiddleware(handler)
	}
	// Passkey 与 WebDAV 的路由定义复用原模块，不与 PocketBase 原生 API 冲突。
	extras := http.NewServeMux()
	passkeyRoutes(extras)
	syncRoutes(extras)
	for _, path := range extraRoutePaths {
		routes[path] = extras.ServeHTTP
	}
	return routes
}

var extraRoutePaths = []string{
	"/api/passkeys/register/begin", "/api/passkeys/register/finish",
	"/api/passkeys/auth/begin", "/api/passkeys/auth/finish", "/api/passkeys",
	"/api/sync/config", "/api/sync/validate", "/api/sync/status", "/api/sync/check",
	"/api/sync/push", "/api/sync/pull", "/api/sync/logs",
}
