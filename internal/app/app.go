package app

import (
	"database/sql"
	"log"
	"net/http"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

var db *sql.DB
var jwtSecret []byte
var dataDir string

// Run 启动 HTTP 服务，包括数据库初始化、路由注册等
func Run() {
	dataDir = os.Getenv("WORKEY_DATA")
	if dataDir == "" {
		dataDir = "."
	}

	uploadsDir := filepath.Join(dataDir, "uploads")
	if err := os.MkdirAll(uploadsDir, 0755); err != nil {
		log.Fatal("Failed to create uploads directory:", err)
	}

	dbPath := os.Getenv("WORKEY_DB")
	if dbPath == "" {
		dbPath = filepath.Join(dataDir, "workey.db")
	}

	var err error
	db, err = sql.Open("sqlite", dbPath)
	if err != nil {
		log.Fatal("Failed to open database:", err)
	}
	defer db.Close()

	if _, err = db.Exec("PRAGMA journal_mode=WAL"); err != nil {
		log.Fatal("Failed to set WAL mode:", err)
	}
	if _, err = db.Exec("PRAGMA foreign_keys=ON"); err != nil {
		log.Fatal("Failed to enable foreign keys:", err)
	}

	initDB()
	initPasskeyDB()
	initSyncDB()

	jwtSecret = getOrCreateJWTSecret()

	// 启动后台自动同步管理器（依赖 jwtSecret，必须在其后启动）
	syncManager := NewSyncManager()
	syncManager.Start()
	defer syncManager.Stop()

	// 启动下班提醒通知器
	notifier := NewNotifier()
	notifier.Start()
	defer notifier.Stop()

	mux := http.NewServeMux()
	registerRoutes(mux)

	log.Println("Server starting on :8000")
	if err := http.ListenAndServe(":8000", mux); err != nil {
		log.Fatal(err)
	}
}

func registerRoutes(mux *http.ServeMux) {
	// 认证
	mux.HandleFunc("/api/auth/register", corsMiddleware(handleRegister))
	mux.HandleFunc("/api/auth/login", corsMiddleware(handleLogin))
	mux.HandleFunc("/api/auth/me", corsMiddleware(authMiddleware(handleMe)))
	mux.HandleFunc("/api/auth/change-password", corsMiddleware(authMiddleware(handleChangePassword)))

	// 考勤
	mux.HandleFunc("/api/attendance/clock-in", corsMiddleware(authMiddleware(handleClockIn)))
	mux.HandleFunc("/api/attendance/clock-out", corsMiddleware(authMiddleware(handleClockOut)))
	mux.HandleFunc("/api/attendance/leave", corsMiddleware(authMiddleware(handleLeave)))
	mux.HandleFunc("/api/attendance/today", corsMiddleware(authMiddleware(handleAttendanceToday)))
	mux.HandleFunc("/api/attendance/range", corsMiddleware(authMiddleware(handleAttendanceRange)))
	mux.HandleFunc("/api/attendance/stats", corsMiddleware(authMiddleware(handleAttendanceStats)))
	mux.HandleFunc("/api/attendance/overtime", corsMiddleware(authMiddleware(handleAttendanceOvertime)))

	// 工作日志
	mux.HandleFunc("/api/work-logs", corsMiddleware(authMiddleware(handleWorkLogs)))
	mux.HandleFunc("/api/work-logs/today", corsMiddleware(authMiddleware(handleWorkLogToday)))
	mux.HandleFunc("/api/work-logs/range", corsMiddleware(authMiddleware(handleWorkLogRange)))

	// 待办事项
	mux.HandleFunc("/api/todos/created-today", corsMiddleware(authMiddleware(handleCreatedTodayTodos)))
	mux.HandleFunc("/api/todos/completed-today", corsMiddleware(authMiddleware(handleCompletedTodayTodos)))
	mux.HandleFunc("/api/todos/completed-range", corsMiddleware(authMiddleware(handleCompletedRangeTodos)))
	mux.HandleFunc("/api/todos", corsMiddleware(authMiddleware(handleTodos)))

	// 工单问题复查
	mux.HandleFunc("/api/ticket-issues", corsMiddleware(authMiddleware(handleTicketIssues)))
	mux.HandleFunc("/api/ticket-issues/stats", corsMiddleware(authMiddleware(handleTicketIssueStats)))

	// 检查清单
	mux.HandleFunc("/api/checklists", corsMiddleware(authMiddleware(handleChecklists)))
	mux.HandleFunc("/api/checklist-snapshots", corsMiddleware(authMiddleware(handleChecklistSnapshots)))
	mux.HandleFunc("/api/checklist-reminders", corsMiddleware(authMiddleware(handleChecklistReminders)))
	mux.HandleFunc("/api/checklist-runs", corsMiddleware(authMiddleware(handleChecklistRuns)))

	// 迭代周期与节假日日历
	mux.HandleFunc("/api/iterations", corsMiddleware(authMiddleware(handleIterations)))
	mux.HandleFunc("/api/iteration-overrides", corsMiddleware(authMiddleware(handleIterationOverrides)))
	mux.HandleFunc("/api/holiday-calendar", corsMiddleware(authMiddleware(handleHolidayCalendar)))

	// 设置
	mux.HandleFunc("/api/settings", corsMiddleware(authMiddleware(handleSettings)))
	mux.HandleFunc("/api/system/version", corsMiddleware(authMiddleware(handleSystemVersion)))

	// 数据管理
	mux.HandleFunc("/api/data/export", corsMiddleware(authMiddleware(handleDataExport)))
	mux.HandleFunc("/api/data/import", corsMiddleware(authMiddleware(handleDataImport)))
	mux.HandleFunc("/api/data/delete", corsMiddleware(authMiddleware(handleDataDelete)))

	// 历史记录
	mux.HandleFunc("/api/history/date-range", corsMiddleware(authMiddleware(handleHistoryDateRange)))

	// Passkey
	passkeyRoutes(mux)

	// WebDAV 同步
	syncRoutes(mux)

	// 推送通知
	mux.HandleFunc("/api/push/vapid-key", corsMiddleware(handleVapidKey))
	mux.HandleFunc("/api/push/subscribe", corsMiddleware(authMiddleware(handlePushSubscribe)))

	// 上传文件
	mux.Handle("/uploads/", http.StripPrefix("/uploads/", http.FileServer(http.Dir(filepath.Join(dataDir, "uploads")))))

	// SPA 前端
	mux.HandleFunc("/", handleSPA)
}
