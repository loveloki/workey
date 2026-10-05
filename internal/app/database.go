package app

import (
	"database/sql"
	"fmt"
	"strings"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// 数字业务 ID 保持旧版 API 与备份格式不变，所有表由 PocketBase 的 data.db 管理。
var workeySchema = []string{
	`CREATE TABLE IF NOT EXISTS workey_profiles (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			username TEXT UNIQUE NOT NULL,
			record_id TEXT NOT NULL UNIQUE REFERENCES workey_accounts(id) ON DELETE CASCADE,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
	`CREATE TABLE IF NOT EXISTS settings (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL
		)`,
	`CREATE TABLE IF NOT EXISTS user_settings (
			user_id INTEGER NOT NULL,
			key TEXT NOT NULL,
			value TEXT NOT NULL,
			PRIMARY KEY(user_id, key),
			FOREIGN KEY(user_id) REFERENCES workey_profiles(id) ON DELETE CASCADE
		)`,
	`CREATE TABLE IF NOT EXISTS attendance (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL REFERENCES workey_profiles(id) ON DELETE CASCADE,
			date TEXT NOT NULL,
			clock_in DATETIME,
			clock_out DATETIME,
			status TEXT NOT NULL DEFAULT 'normal',
			is_overtime INTEGER NOT NULL DEFAULT 0,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(user_id, date)
		)`,
	`CREATE TABLE IF NOT EXISTS work_logs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL REFERENCES workey_profiles(id) ON DELETE CASCADE,
			date TEXT NOT NULL,
			content TEXT NOT NULL DEFAULT '',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(user_id, date)
		)`,
	`CREATE TABLE IF NOT EXISTS checklists (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL REFERENCES workey_profiles(id) ON DELETE CASCADE,
			title TEXT NOT NULL DEFAULT '',
			items TEXT NOT NULL DEFAULT '[]',
			kind TEXT NOT NULL DEFAULT 'manual',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
	`CREATE TABLE IF NOT EXISTS checklist_runs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL REFERENCES workey_profiles(id) ON DELETE CASCADE,
			checklist_id INTEGER NOT NULL REFERENCES checklists(id),
			kind TEXT NOT NULL,
			occurrence_key TEXT NOT NULL,
			iteration_number INTEGER,
			title TEXT NOT NULL,
			items TEXT NOT NULL DEFAULT '[]',
			data TEXT NOT NULL DEFAULT '{}',
			completed INTEGER NOT NULL DEFAULT 0,
			completed_at DATETIME,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(user_id, kind, occurrence_key)
		)`,
	`CREATE TABLE IF NOT EXISTS checklist_snapshots (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL REFERENCES workey_profiles(id) ON DELETE CASCADE,
			checklist_id INTEGER NOT NULL,
			title TEXT NOT NULL DEFAULT '',
			items_hash TEXT NOT NULL DEFAULT '',
			data TEXT NOT NULL DEFAULT '{}',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
	`CREATE TABLE IF NOT EXISTS todos (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL REFERENCES workey_profiles(id) ON DELETE CASCADE,
			content TEXT NOT NULL DEFAULT '',
			url TEXT NOT NULL DEFAULT '',
			done INTEGER NOT NULL DEFAULT 0,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
	`CREATE TABLE IF NOT EXISTS ticket_issues (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL REFERENCES workey_profiles(id) ON DELETE CASCADE,
			ticket_no TEXT NOT NULL,
			ticket_title TEXT NOT NULL DEFAULT '',
			ticket_url TEXT NOT NULL DEFAULT '',
			occurred_on TEXT NOT NULL,
			cause_type TEXT NOT NULL CHECK(cause_type IN ('code', 'operation')),
			problem_description TEXT NOT NULL,
			cause_detail TEXT NOT NULL,
			resolution TEXT NOT NULL DEFAULT '',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
	`CREATE INDEX IF NOT EXISTS idx_ticket_issues_user_date ON ticket_issues(user_id, occurred_on DESC)`,
	`CREATE INDEX IF NOT EXISTS idx_ticket_issues_user_cause ON ticket_issues(user_id, cause_type)`,
	`CREATE TABLE IF NOT EXISTS iteration_overrides (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL REFERENCES workey_profiles(id) ON DELETE CASCADE,
			iteration_number INTEGER NOT NULL,
			start_date TEXT NOT NULL,
			end_date TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(user_id, iteration_number)
		)`,
	`CREATE TABLE IF NOT EXISTS holiday_calendar_days (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL REFERENCES workey_profiles(id) ON DELETE CASCADE,
			date TEXT NOT NULL,
			is_workday INTEGER NOT NULL,
			name TEXT NOT NULL DEFAULT '',
			source TEXT NOT NULL DEFAULT '',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(user_id, date)
		)`,
	`CREATE INDEX IF NOT EXISTS idx_holiday_calendar_user_date ON holiday_calendar_days(user_id, date)`,
	`CREATE TABLE IF NOT EXISTS pending_reminders (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL REFERENCES workey_profiles(id) ON DELETE CASCADE,
			send_at DATETIME NOT NULL,
			attempts INTEGER NOT NULL DEFAULT 0,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
	`CREATE TABLE IF NOT EXISTS push_subscriptions (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL REFERENCES workey_profiles(id) ON DELETE CASCADE,
			endpoint TEXT NOT NULL,
			p256dh TEXT NOT NULL,
			auth TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(user_id, endpoint)
		)`,
	`CREATE TABLE IF NOT EXISTS passkeys (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL REFERENCES workey_profiles(id) ON DELETE CASCADE,
		name TEXT NOT NULL,
		credential_id BLOB NOT NULL UNIQUE,
		public_key BLOB NOT NULL,
		sign_count INTEGER NOT NULL DEFAULT 0,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		last_used_at DATETIME
	)`,
	`CREATE TABLE IF NOT EXISTS user_keys (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL UNIQUE REFERENCES workey_profiles(id) ON DELETE CASCADE,
		master_key_enc TEXT NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	)`,
	`CREATE TABLE IF NOT EXISTS sync_config (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL UNIQUE REFERENCES workey_profiles(id) ON DELETE CASCADE,
			webdav_url TEXT NOT NULL,
			webdav_username TEXT NOT NULL,
			webdav_password_enc TEXT NOT NULL,
			remote_path TEXT NOT NULL DEFAULT '',
			auto_sync_interval_minutes INTEGER NOT NULL DEFAULT 0,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
	`CREATE TABLE IF NOT EXISTS sync_state (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL UNIQUE REFERENCES workey_profiles(id) ON DELETE CASCADE,
			last_local_hash TEXT NOT NULL DEFAULT '',
			last_remote_hash TEXT NOT NULL DEFAULT '',
			last_sync_at DATETIME NOT NULL,
			direction TEXT NOT NULL DEFAULT ''
		)`,
	`CREATE TABLE IF NOT EXISTS sync_log (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL REFERENCES workey_profiles(id) ON DELETE CASCADE,
			direction TEXT NOT NULL,
			status TEXT NOT NULL,
			message TEXT NOT NULL DEFAULT '',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
}

func init() {
	m.Register(func(app core.App) error {
		// 首次安装不能把已有 PocketBase 集合或其他应用的同名表当成 Workey 数据。
		for _, query := range workeySchema {
			if strings.HasPrefix(query, "CREATE TABLE IF NOT EXISTS ") {
				table := strings.Fields(query)[5]
				if app.HasTable(table) {
					return fmt.Errorf("Workey schema conflicts with existing table %q; use a separate PocketBase data directory", table)
				}
			}
		}
		accounts := core.NewAuthCollection("workey_accounts")
		accounts.Fields.Add(&core.TextField{Name: "username", Required: true, Max: 100})
		accounts.Fields.GetByName(core.FieldNameEmail).(*core.EmailField).Required = false
		accounts.Fields.GetByName(core.FieldNamePassword).(*core.PasswordField).Min = 6
		accounts.PasswordAuth.Enabled = true
		accounts.PasswordAuth.IdentityFields = []string{"username"}
		accounts.AuthToken.Duration = 72 * 3600
		accounts.Indexes = append(accounts.Indexes,
			"CREATE UNIQUE INDEX idx_workey_accounts_username ON workey_accounts (username)")
		// 原生记录 API 仅管理员可访问；普通用户通过带归属校验的 Workey API 操作。
		if err := app.Save(accounts); err != nil {
			return fmt.Errorf("create Workey auth collection: %w", err)
		}
		for _, query := range workeySchema {
			if _, err := app.DB().NewQuery(query).Execute(); err != nil {
				return fmt.Errorf("create Workey business schema: %w", err)
			}
		}
		return nil
	}, func(app core.App) error {
		// 回滚会删除业务数据，只通过 PocketBase 的显式 migrate down 命令执行。
		for _, table := range []string{
			"sync_log", "sync_state", "sync_config", "user_keys", "passkeys",
			"push_subscriptions", "pending_reminders", "holiday_calendar_days",
			"iteration_overrides", "ticket_issues", "todos", "checklist_runs",
			"checklist_snapshots", "checklists", "work_logs", "attendance",
			"user_settings", "workey_profiles", "settings",
		} {
			if err := app.DeleteTable(table); err != nil {
				return err
			}
		}
		accounts, err := app.FindCollectionByNameOrId("workey_accounts")
		if err != nil {
			return err
		}
		return app.Delete(accounts)
	}, "1791226800_workey_schema.go")
}

// getOrCreateEncryptionSecret 仅用于 WebDAV 配置和主密钥的静态加密，不用于认证。
func getOrCreateEncryptionSecret() ([]byte, error) {
	var secret string
	err := db.QueryRow("SELECT value FROM settings WHERE key = 'encryption_secret'").Scan(&secret)
	if err == sql.ErrNoRows {
		secret = generateRandomString(64)
		if _, err := db.Exec("INSERT INTO settings (key, value) VALUES ('encryption_secret', ?)", secret); err != nil {
			return nil, err
		}
	} else if err != nil {
		return nil, err
	}
	return []byte(secret), nil
}
