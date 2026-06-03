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
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
