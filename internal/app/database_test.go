package app

import (
	"database/sql"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	_ "modernc.org/sqlite"
)

func TestInitDB(t *testing.T) {
	var err error
	db, err = sql.Open("sqlite", ":memory:")
	require.NoError(t, err)
	defer db.Close()

	db.Exec("PRAGMA foreign_keys=ON")

	// initDB 不应 panic
	initDB()

	// 验证所有表都已创建
	tables := []string{"settings", "user_settings", "users", "attendance", "work_logs",
		"checklists", "checklist_snapshots", "todos", "iteration_overrides"}

	for _, table := range tables {
		var name string
		err := db.QueryRow("SELECT name FROM sqlite_master WHERE type='table' AND name=?", table).Scan(&name)
		assert.NoError(t, err, "表 %s 应该存在", table)
	}
}

func TestInitPasskeyDB(t *testing.T) {
	var err error
	db, err = sql.Open("sqlite", ":memory:")
	require.NoError(t, err)
	defer db.Close()

	initPasskeyDB()

	var name string
	err = db.QueryRow("SELECT name FROM sqlite_master WHERE type='table' AND name='passkeys'").Scan(&name)
	assert.NoError(t, err, "passkeys 表应该存在")
}

func TestGetOrCreateJWTSecret(t *testing.T) {
	var err error
	db, err = sql.Open("sqlite", ":memory:")
	require.NoError(t, err)
	defer db.Close()

	db.Exec("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)")

	// 首次调用应创建密钥
	secret1 := getOrCreateJWTSecret()
	assert.NotEmpty(t, secret1)

	// 再次调用应返回同一密钥
	secret2 := getOrCreateJWTSecret()
	assert.Equal(t, secret1, secret2)
}

func TestMigrateDB(t *testing.T) {
	var err error
	db, err = sql.Open("sqlite", ":memory:")
	require.NoError(t, err)
	defer db.Close()

	db.Exec("PRAGMA foreign_keys=ON")

	// 创建不带 status 和 is_overtime 列的旧版 attendance 表
	db.Exec(`CREATE TABLE users (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		username TEXT UNIQUE NOT NULL,
		password_hash TEXT NOT NULL
	)`)
	db.Exec(`CREATE TABLE attendance (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		date TEXT NOT NULL,
		clock_in DATETIME,
		clock_out DATETIME,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		UNIQUE(user_id, date)
	)`)

	// 迁移应成功添加列
	migrateDB()

	// 验证 status 列存在
	rows, err := db.Query("PRAGMA table_info(attendance)")
	require.NoError(t, err)
	defer rows.Close()

	columns := map[string]bool{}
	for rows.Next() {
		var cid int
		var name, ctype string
		var notnull int
		var dflt *string
		var pk int
		rows.Scan(&cid, &name, &ctype, &notnull, &dflt, &pk)
		columns[name] = true
	}

	assert.True(t, columns["status"], "应该有 status 列")
	assert.True(t, columns["is_overtime"], "应该有 is_overtime 列")
}
