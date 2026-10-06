// Package migrations 定义 Workey 的 PocketBase collection 结构。
//
// 按官方约定作为独立包，由 cmd/workey 空白导入；新增迁移可在开发期通过
// `go run ./cmd/workey migrate create <name>` 生成到本目录。
package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

const datePattern = `^\d{4}-\d{2}-\d{2}$`

// 长文本字段（日志、问题描述等）放宽 PocketBase 默认的 5000 字符上限。
const longTextMax = 1 << 20

func init() {
	m.Register(func(app core.App) error {
		accounts := core.NewAuthCollection("workey_accounts")
		accounts.Fields.Add(&core.TextField{Name: "username", Required: true, Max: 100})
		accounts.Fields.GetByName(core.FieldNameEmail).(*core.EmailField).Required = false
		accounts.Fields.GetByName(core.FieldNamePassword).(*core.PasswordField).Min = 6
		// 用户设置直接作为认证记录字段保存，空字符串表示使用默认值。
		accounts.Fields.Add(
			&core.TextField{Name: "timezone", Max: 20},
			&core.TextField{Name: "kanban_url", Max: 2000},
			&core.TextField{Name: "theme", Max: 20},
			&core.TextField{Name: "iteration_start_date", Max: 10},
			&core.TextField{Name: "iteration_duration_days", Max: 10},
			&core.TextField{Name: "iteration_workdays", Max: 10},
			&core.TextField{Name: "reminder_delay", Max: 10},
		)
		addTimestamps(accounts)
		accounts.PasswordAuth.Enabled = true
		accounts.PasswordAuth.IdentityFields = []string{"username"}
		accounts.AuthToken.Duration = 72 * 3600
		accounts.AddIndex("idx_workey_accounts_username", true, "username", "")
		// 所有 collection 的 list/view/create/update/delete 规则保持 nil（仅超级管理员）：
		// 前端只调用自定义 /api/* 路由，PocketBase 原生 record API 不对普通用户开放。
		if err := app.Save(accounts); err != nil {
			return err
		}

		attendance := newUserCollection("attendance", accounts.Id)
		attendance.Fields.Add(
			&core.TextField{Name: "date", Required: true, Pattern: datePattern},
			// 打卡时间保留原始字符串：旧备份中可能是 RFC3339，也可能是 "HH:MM"。
			&core.TextField{Name: "clock_in", Max: 40},
			&core.TextField{Name: "clock_out", Max: 40},
			&core.SelectField{Name: "status", Required: true, MaxSelect: 1, Values: []string{"normal", "leave", "business_trip"}},
			&core.BoolField{Name: "is_overtime"},
		)
		attendance.AddIndex("idx_attendance_user_date", true, "user, date", "")

		workLogs := newUserCollection("work_logs", accounts.Id)
		workLogs.Fields.Add(
			&core.TextField{Name: "date", Required: true, Pattern: datePattern},
			&core.TextField{Name: "content", Max: longTextMax},
		)
		workLogs.AddIndex("idx_work_logs_user_date", true, "user, date", "")

		todos := newUserCollection("todos", accounts.Id)
		todos.Fields.Add(
			&core.TextField{Name: "content", Max: longTextMax},
			&core.TextField{Name: "url", Max: 10000},
			&core.BoolField{Name: "done"},
		)
		todos.AddIndex("idx_todos_user_done", false, "user, done", "")

		ticketIssues := newUserCollection("ticket_issues", accounts.Id)
		ticketIssues.Fields.Add(
			&core.TextField{Name: "ticket_no", Required: true, Max: 200},
			&core.TextField{Name: "ticket_title", Max: 1000},
			&core.TextField{Name: "ticket_url", Max: 10000},
			&core.TextField{Name: "occurred_on", Required: true, Pattern: datePattern},
			&core.SelectField{Name: "cause_type", Required: true, MaxSelect: 1, Values: []string{"code", "operation"}},
			&core.TextField{Name: "problem_description", Required: true, Max: longTextMax},
			&core.TextField{Name: "cause_detail", Required: true, Max: longTextMax},
			&core.TextField{Name: "resolution", Max: longTextMax},
		)
		ticketIssues.AddIndex("idx_ticket_issues_user_date", false, "user, occurred_on", "")

		checklists := newUserCollection("checklists", accounts.Id)
		checklists.Fields.Add(
			&core.TextField{Name: "title", Required: true, Max: 1000},
			&core.JSONField{Name: "items"},
		)
		checklists.AddIndex("idx_checklists_user", false, "user", "")

		iterationOverrides := newUserCollection("iteration_overrides", accounts.Id)
		iterationOverrides.Fields.Add(
			&core.NumberField{Name: "iteration_number", Required: true, OnlyInt: true},
			&core.TextField{Name: "start_date", Required: true, Pattern: datePattern},
			&core.TextField{Name: "end_date", Required: true, Pattern: datePattern},
		)
		iterationOverrides.AddIndex("idx_iteration_overrides_user_number", true, "user, iteration_number", "")

		holidays := newUserCollection("holiday_calendar_days", accounts.Id)
		holidays.Fields.Add(
			&core.TextField{Name: "date", Required: true, Pattern: datePattern},
			&core.BoolField{Name: "is_workday"},
			&core.TextField{Name: "name", Max: 400},
			&core.TextField{Name: "source", Max: 1000},
		)
		holidays.AddIndex("idx_holiday_calendar_days_user_date", true, "user, date", "")

		for _, collection := range []*core.Collection{attendance, workLogs, todos, ticketIssues, checklists, iterationOverrides, holidays} {
			if err := app.Save(collection); err != nil {
				return err
			}
		}

		// 快照随所属清单级联删除；必须在 checklists 保存后才能引用其 ID。
		snapshots := newUserCollection("checklist_snapshots", accounts.Id)
		snapshots.Fields.Add(
			&core.RelationField{Name: "checklist", Required: true, MaxSelect: 1, CascadeDelete: true, CollectionId: checklists.Id},
			&core.TextField{Name: "title", Max: 1000},
			&core.TextField{Name: "items_hash", Max: 200},
			&core.JSONField{Name: "data"},
		)
		snapshots.AddIndex("idx_checklist_snapshots_user_checklist", false, "user, checklist", "")
		return app.Save(snapshots)
	}, func(app core.App) error {
		for _, name := range []string{
			"checklist_snapshots", "holiday_calendar_days", "iteration_overrides", "checklists",
			"ticket_issues", "todos", "work_logs", "attendance", "workey_accounts",
		} {
			collection, err := app.FindCollectionByNameOrId(name)
			if err != nil {
				return err
			}
			if err := app.Delete(collection); err != nil {
				return err
			}
		}
		return nil
	})
}

// newUserCollection 创建归属于单个账号的业务 collection，账号删除时级联删除。
func newUserCollection(name, accountsID string) *core.Collection {
	collection := core.NewBaseCollection(name)
	collection.Fields.Add(&core.RelationField{
		Name: "user", Required: true, MaxSelect: 1, CascadeDelete: true, CollectionId: accountsID,
	})
	addTimestamps(collection)
	return collection
}

func addTimestamps(collection *core.Collection) {
	collection.Fields.Add(
		&core.AutodateField{Name: "created", OnCreate: true},
		&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
	)
}
