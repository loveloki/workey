package app

import (
	"context"
	"database/sql"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDatabaseAdapterBinding(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	var literal, bound, escaped string
	require.NoError(t, db.QueryRow(`SELECT '?', ?, 'it''s ?'`, "not SQL'; DROP TABLE todos; --").Scan(&literal, &bound, &escaped))
	assert.Equal(t, "?", literal)
	assert.Equal(t, "not SQL'; DROP TABLE todos; --", bound)
	assert.Equal(t, "it's ?", escaped)
	assert.True(t, pbApp.HasTable("todos"))
	_, err := db.Exec("SELECT ?", 1, 2)
	assert.Error(t, err)
	_, err = db.Query("SELECT ?")
	assert.Error(t, err)
	assert.Error(t, db.QueryRow("SELECT ?", 1, 2).Scan(&bound))
	assert.ErrorIs(t, db.QueryRow("SELECT id FROM workey_profiles").Scan(&literal), sql.ErrNoRows)
}

func TestDatabaseAdapterWriterTransaction(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := createTestUser(t, "transactionuser", "password123")
	ctx := context.Background()
	tx, err := db.BeginTx(ctx)
	require.NoError(t, err)
	_, err = tx.ExecContext(ctx, "INSERT INTO todos (user_id, content) VALUES (?, ?)", userID, "rolled back")
	require.NoError(t, err)
	require.NoError(t, tx.Rollback())
	var count int
	require.NoError(t, db.QueryRow("SELECT COUNT(*) FROM todos").Scan(&count))
	assert.Zero(t, count)
	tx, err = db.BeginTx(ctx)
	require.NoError(t, err)
	_, err = tx.ExecContext(ctx, "INSERT INTO todos (user_id, content) VALUES (?, ?)", userID, "committed")
	require.NoError(t, err)
	require.NoError(t, tx.Commit())
	require.NoError(t, db.QueryRow("SELECT COUNT(*) FROM todos").Scan(&count))
	assert.Equal(t, 1, count)
}
