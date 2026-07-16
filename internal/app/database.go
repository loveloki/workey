package app

import (
	"database/sql"
	"log"
)

// 数据库初始化与迁移

func initDB() {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			username TEXT UNIQUE NOT NULL,
			password_hash TEXT NOT NULL,
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
			FOREIGN KEY(user_id) REFERENCES users(id)
		)`,
		`CREATE TABLE IF NOT EXISTS attendance (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL REFERENCES users(id),
			date TEXT NOT NULL,
			clock_in DATETIME,
			clock_out DATETIME,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(user_id, date)
		)`,
		`CREATE TABLE IF NOT EXISTS work_logs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL REFERENCES users(id),
			date TEXT NOT NULL,
			content TEXT NOT NULL DEFAULT '',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(user_id, date)
		)`,
		`CREATE TABLE IF NOT EXISTS checklists (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL REFERENCES users(id),
			title TEXT NOT NULL DEFAULT '',
			items TEXT NOT NULL DEFAULT '[]',
			kind TEXT NOT NULL DEFAULT 'manual',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS checklist_runs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL REFERENCES users(id),
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
			user_id INTEGER NOT NULL REFERENCES users(id),
			checklist_id INTEGER NOT NULL,
			title TEXT NOT NULL DEFAULT '',
			items_hash TEXT NOT NULL DEFAULT '',
			data TEXT NOT NULL DEFAULT '{}',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS todos (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL REFERENCES users(id),
			content TEXT NOT NULL DEFAULT '',
			url TEXT NOT NULL DEFAULT '',
			done INTEGER NOT NULL DEFAULT 0,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS ticket_issues (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL REFERENCES users(id),
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
			user_id INTEGER NOT NULL REFERENCES users(id),
			iteration_number INTEGER NOT NULL,
			start_date TEXT NOT NULL,
			end_date TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(user_id, iteration_number)
		)`,
		`CREATE TABLE IF NOT EXISTS holiday_calendar_days (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL REFERENCES users(id),
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
			user_id INTEGER NOT NULL REFERENCES users(id),
			send_at DATETIME NOT NULL,
			attempts INTEGER NOT NULL DEFAULT 0,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS push_subscriptions (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL REFERENCES users(id),
			endpoint TEXT NOT NULL,
			p256dh TEXT NOT NULL,
			auth TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(user_id, endpoint)
		)`,
	}
	for _, q := range queries {
		if _, err := db.Exec(q); err != nil {
			log.Fatalf("Failed to init DB: %v\nQuery: %s", err, q)
		}
	}

	migrateDB()
}

func migrateDB() {
	// 检查 attendance 表是否存在 status 列
	rows, err := db.Query("PRAGMA table_info(attendance)")
	if err != nil {
		log.Fatalf("Failed to get table info: %v", err)
	}
	defer rows.Close()

	hasStatus := false
	for rows.Next() {
		var cid int
		var name, ctype string
		var notnull int
		var dflt_value *string
		var pk int
		err = rows.Scan(&cid, &name, &ctype, &notnull, &dflt_value, &pk)
		if err == nil && name == "status" {
			hasStatus = true
			break
		}
	}

	if !hasStatus {
		_, err = db.Exec("ALTER TABLE attendance ADD COLUMN status TEXT NOT NULL DEFAULT 'normal'")
		if err != nil {
			log.Fatalf("Failed to add status column to attendance: %v", err)
		}
	}

	// 迁移：添加 is_overtime 列
	rows2, err := db.Query("PRAGMA table_info(attendance)")
	if err != nil {
		log.Fatalf("Failed to get table info: %v", err)
	}
	hasOvertime := false
	for rows2.Next() {
		var cid int
		var name, ctype string
		var notnull int
		var dflt_value *string
		var pk int
		err = rows2.Scan(&cid, &name, &ctype, &notnull, &dflt_value, &pk)
		if err == nil && name == "is_overtime" {
			hasOvertime = true
		}
	}
	rows2.Close()

	if !hasOvertime {
		_, err = db.Exec("ALTER TABLE attendance ADD COLUMN is_overtime INTEGER NOT NULL DEFAULT 0")
		if err != nil {
			log.Fatalf("Failed to add is_overtime column: %v", err)
		}
		// 回填：已有的周末非请假记录标记为加班
		_, err = db.Exec(`UPDATE attendance SET is_overtime = 1
			WHERE status != 'leave'
			  AND (strftime('%w', date) = '0' OR strftime('%w', date) = '6')`)
		if err != nil {
			log.Fatalf("Failed to backfill is_overtime: %v", err)
		}
	}

	if tableExists("checklists") {
		if !tableHasColumn("checklists", "kind") {
			if _, err = db.Exec("ALTER TABLE checklists ADD COLUMN kind TEXT NOT NULL DEFAULT 'manual'"); err != nil {
				log.Fatalf("Failed to add checklist kind column: %v", err)
			}
		}
		if _, err = db.Exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_checklists_user_system_kind
			ON checklists(user_id, kind) WHERE kind IN ('daily_start', 'iteration_end')`); err != nil {
			log.Fatalf("Failed to create checklist kind index: %v", err)
		}
	}

	// 旧版按自然日配置，迁移为等价的每周工作日数（14 天 → 10 个工作日）。
	if tableExists("user_settings") {
		_, err = db.Exec(`INSERT INTO user_settings (user_id, key, value)
			SELECT user_id, 'iteration_workdays',
				CAST(CASE WHEN CAST(value AS INTEGER) < 2 THEN 1
					ELSE (CAST(value AS INTEGER) * 5 + 3) / 7 END AS TEXT)
			FROM user_settings old
			WHERE key = 'iteration_duration_days'
				AND NOT EXISTS (
					SELECT 1 FROM user_settings current
					WHERE current.user_id = old.user_id AND current.key = 'iteration_workdays'
				)`)
		if err != nil {
			log.Fatalf("Failed to migrate iteration workdays: %v", err)
		}
	}
}

func tableExists(table string) bool {
	var name string
	return db.QueryRow("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", table).Scan(&name) == nil
}

func tableHasColumn(table, column string) bool {
	rows, err := db.Query("PRAGMA table_info(" + table + ")")
	if err != nil {
		return false
	}
	defer rows.Close()
	for rows.Next() {
		var cid int
		var name, columnType string
		var notNull int
		var defaultValue *string
		var primaryKey int
		if rows.Scan(&cid, &name, &columnType, &notNull, &defaultValue, &primaryKey) == nil && name == column {
			return true
		}
	}
	return false
}

// initPasskeyDB 创建 passkey 相关数据表
func initPasskeyDB() {
	query := `CREATE TABLE IF NOT EXISTS passkeys (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL REFERENCES users(id),
		name TEXT NOT NULL,
		credential_id BLOB NOT NULL UNIQUE,
		public_key BLOB NOT NULL,
		sign_count INTEGER NOT NULL DEFAULT 0,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		last_used_at DATETIME
	)`
	if _, err := db.Exec(query); err != nil {
		log.Printf("Warning: failed to create passkeys table: %v\n", err)
	}

	userKeysQuery := `CREATE TABLE IF NOT EXISTS user_keys (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
		master_key_enc TEXT NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	)`
	if _, err := db.Exec(userKeysQuery); err != nil {
		log.Printf("Warning: failed to create user_keys table: %v\n", err)
	}
}

// getOrCreateJWTSecret 从数据库获取或创建 JWT 签名密钥
func getOrCreateJWTSecret() []byte {
	var secret string
	err := db.QueryRow("SELECT value FROM settings WHERE key='jwt_secret'").Scan(&secret)
	if err == sql.ErrNoRows {
		secret = generateRandomString(64)
		db.Exec("INSERT INTO settings (key, value) VALUES ('jwt_secret', ?)", secret)
	} else if err != nil {
		log.Fatal("Failed to get JWT secret:", err)
	}
	return []byte(secret)
}
