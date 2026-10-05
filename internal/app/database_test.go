package app

import (
	"testing"

	"github.com/pocketbase/pocketbase"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPocketBaseSchemaDoesNotAdoptExistingTables(t *testing.T) {
	pb := pocketbase.NewWithConfig(pocketbase.Config{DefaultDataDir: t.TempDir()})
	require.NoError(t, pb.Bootstrap())
	defer pb.ClearBootstrap()
	_, err := pb.DB().NewQuery("CREATE TABLE todos (id TEXT PRIMARY KEY, content TEXT)").Execute()
	require.NoError(t, err)
	_, err = pb.DB().NewQuery("INSERT INTO todos VALUES ('external', 'unrelated data')").Execute()
	require.NoError(t, err)
	err = pb.RunAppMigrations()
	require.ErrorContains(t, err, `conflicts with existing table "todos"`)
	var content string
	require.NoError(t, pb.DB().NewQuery("SELECT content FROM todos WHERE id = 'external'").Row(&content))
	assert.Equal(t, "unrelated data", content)
	assert.False(t, pb.HasTable("workey_profiles"))
	_, err = pb.FindCollectionByNameOrId("workey_accounts")
	assert.Error(t, err)
}

func TestPocketBaseSchema(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	for _, table := range []string{"settings", "user_settings", "workey_profiles", "attendance", "work_logs",
		"checklists", "checklist_snapshots", "todos", "ticket_issues", "iteration_overrides",
		"holiday_calendar_days", "passkeys", "user_keys", "push_subscriptions", "pending_reminders",
		"sync_config", "sync_state", "sync_log"} {
		assert.True(t, pbApp.HasTable(table), "missing table %s", table)
	}
	accounts, err := pbApp.FindCollectionByNameOrId("workey_accounts")
	require.NoError(t, err)
	assert.True(t, accounts.IsAuth())
	assert.Equal(t, []string{"username"}, accounts.PasswordAuth.IdentityFields)
	assert.Nil(t, accounts.CreateRule)
	assert.Nil(t, accounts.ListRule)
	assert.True(t, pbApp.HasTable("users"), "PocketBase 默认 users 集合不能被业务映射表覆盖")
	columns, err := pbApp.TableColumns("workey_profiles")
	require.NoError(t, err)
	assert.NotContains(t, columns, "password_hash")
	assert.Contains(t, columns, "record_id")
}

func TestEncryptionSecret(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	secret, err := getOrCreateEncryptionSecret()
	require.NoError(t, err)
	assert.NotEmpty(t, secret)
	second, err := getOrCreateEncryptionSecret()
	require.NoError(t, err)
	assert.Equal(t, secret, second)
}

func TestPocketBaseSchemaReopen(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := createTestUser(t, "persisted", "password123")
	_, err := db.Exec("INSERT INTO todos (user_id, content) VALUES (?, ?)", userID, "preserved")
	require.NoError(t, err)
	directory := dataDir
	require.NoError(t, pbApp.ClearBootstrap())
	pb := New(directory)
	require.NoError(t, pb.Bootstrap())
	defer pb.ClearBootstrap()
	var content string
	require.NoError(t, db.QueryRow("SELECT content FROM todos WHERE user_id = ?", userID).Scan(&content))
	assert.Equal(t, "preserved", content)
	record, err := accountForUser(userID)
	require.NoError(t, err)
	assert.True(t, record.ValidatePassword("password123"))
}
