package app

import (
	"fmt"
	"os"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"
	"github.com/pocketbase/pocketbase/tools/osutils"
	"github.com/pocketbase/pocketbase/tools/router"
)

// Run 启动 Workey（PocketBase 扩展）。collection 迁移由 workey/migrations 包注册，
// 未应用的迁移在 serve 时由 PocketBase 自动执行。
func Run() error {
	if os.Getenv("WORKEY_DB") != "" {
		return fmt.Errorf("WORKEY_DB is no longer supported; export the old version and import its ZIP backup")
	}
	directory := os.Getenv("WORKEY_DATA")
	if directory == "" {
		directory = "./pb_data"
	}
	pb := pocketbase.NewWithConfig(pocketbase.Config{DefaultDataDir: directory})
	migratecmd.MustRegister(pb, pb.RootCmd, migratecmd.Config{
		// 仅在 go run 开发期根据管理后台的 collection 变更自动生成迁移文件。
		Automigrate: osutils.IsProbablyGoRun(),
	})
	pb.OnServe().BindFunc(func(se *core.ServeEvent) error {
		registerRoutes(se.Router)
		return se.Next()
	})
	return pb.Start()
}

const apiPrefix = "/api/workey"

// registerRoutes 注册 Workey 自定义 API 与 SPA 静态文件。
// CORS 使用 PocketBase 默认中间件，可通过 serve 的 --origins 参数限制来源。
func registerRoutes(r *router.Router[*core.RequestEvent]) {
	// 按官方建议使用 /api/workey 前缀，避免与 PocketBase 系统路由（如 /api/settings）冲突。
	r.POST(apiPrefix+"/auth/register", handleRegister)
	r.POST(apiPrefix+"/auth/login", handleLogin)

	g := r.Group(apiPrefix)
	g.Bind(apis.RequireAuth(accountCollection))

	g.GET("/auth/me", handleMe)
	g.POST("/auth/refresh", handleRefresh)
	g.POST("/auth/change-password", handleChangePassword)

	g.POST("/attendance/clock-in", handleClockIn)
	g.POST("/attendance/clock-out", handleClockOut)
	g.POST("/attendance/leave", handleLeave)
	g.GET("/attendance/today", handleAttendanceToday)
	g.GET("/attendance/range", handleAttendanceRange)
	g.GET("/attendance/stats", handleAttendanceStats)
	g.POST("/attendance/overtime", handleAttendanceOvertime)
	g.PUT("/attendance/overtime", handleAttendanceOvertime)

	g.POST("/work-logs", handleWorkLogSave)
	g.GET("/work-logs/today", handleWorkLogToday)
	g.GET("/work-logs/range", handleWorkLogRange)

	g.GET("/todos", handleGetTodos)
	g.POST("/todos", handleCreateTodo)
	g.PUT("/todos", handleUpdateTodo)
	g.DELETE("/todos", handleDeleteTodo)
	g.GET("/todos/created-today", handleCreatedTodayTodos)
	g.GET("/todos/completed-today", handleCompletedTodayTodos)
	g.GET("/todos/completed-range", handleCompletedRangeTodos)

	g.GET("/ticket-issues", handleTicketIssueList)
	g.POST("/ticket-issues", handleTicketIssueCreate)
	g.PUT("/ticket-issues", handleTicketIssueUpdate)
	g.DELETE("/ticket-issues", handleTicketIssueDelete)
	g.GET("/ticket-issues/stats", handleTicketIssueStats)

	g.GET("/checklists", handleGetChecklists)
	g.POST("/checklists", handleCreateChecklist)
	g.PUT("/checklists", handleUpdateChecklist)
	g.DELETE("/checklists", handleDeleteChecklist)
	g.GET("/checklist-snapshots", handleGetChecklistSnapshots)
	g.POST("/checklist-snapshots", handleCreateChecklistSnapshot)
	g.DELETE("/checklist-snapshots", handleDeleteChecklistSnapshot)

	g.GET("/iterations", handleIterations)
	g.GET("/iteration-overrides", handleGetIterationOverrides)
	g.POST("/iteration-overrides", handleSaveIterationOverride)
	g.DELETE("/iteration-overrides", handleDeleteIterationOverride)

	g.GET("/holiday-calendar", handleGetHolidayCalendar)
	g.POST("/holiday-calendar", handleImportHolidayCalendar).Bind(apis.BodyLimit(maxHolidayImportBytes))
	g.DELETE("/holiday-calendar", handleDeleteHolidayCalendarYear)

	g.GET("/settings", handleGetSettings)
	g.POST("/settings", handleSaveSettings)
	g.GET("/system/version", handleSystemVersion)
	g.GET("/history/date-range", handleHistoryDateRange)

	g.GET("/data/export", handleDataExport)
	g.POST("/data/import", handleDataImport).Bind(apis.BodyLimit(maxDataArchiveBytes + (1 << 20)))
	g.DELETE("/data/delete", handleDataDelete)

	registerSPA(r)
}
