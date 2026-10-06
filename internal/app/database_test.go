package app

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCollectionsSchema(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	accounts, err := testApp.FindCollectionByNameOrId(accountCollection)
	require.NoError(t, err)
	assert.True(t, accounts.IsAuth())
	assert.Equal(t, []string{"username"}, accounts.PasswordAuth.IdentityFields)
	for _, name := range append([]string{accountCollection}, userDataCollections...) {
		collection, err := testApp.FindCollectionByNameOrId(name)
		require.NoError(t, err, name)
		// 原生 record API 只对超级管理员开放；普通用户只能经由 /api/workey/*。
		assert.Nil(t, collection.ListRule, name)
		assert.Nil(t, collection.ViewRule, name)
		assert.Nil(t, collection.CreateRule, name)
		assert.Nil(t, collection.UpdateRule, name)
		assert.Nil(t, collection.DeleteRule, name)
		if name != accountCollection {
			user, ok := collection.Fields.GetByName("user").(*core.RelationField)
			require.True(t, ok, name)
			assert.Equal(t, accounts.Id, user.CollectionId, name)
			assert.True(t, user.CascadeDelete, name)
		}
	}
	for _, legacy := range []string{"workey_profiles", "settings", "user_settings", "passkeys", "sync_config", "push_subscriptions", "checklist_runs"} {
		assert.False(t, testApp.HasTable(legacy), legacy)
	}
}

func TestMigrationRefusesExistingTable(t *testing.T) {
	app := core.NewBaseApp(core.BaseAppConfig{DataDir: t.TempDir()})
	require.NoError(t, app.Bootstrap())
	defer app.ResetBootstrapState()
	_, err := app.DB().NewQuery("CREATE TABLE todos (id TEXT PRIMARY KEY, content TEXT)").Execute()
	require.NoError(t, err)
	_, err = app.DB().NewQuery("INSERT INTO todos VALUES ('external', 'unrelated data')").Execute()
	require.NoError(t, err)

	// PocketBase 的 collection 名称校验会拒绝与已有表同名，整个迁移回滚。
	require.Error(t, app.RunAllMigrations())
	var content string
	require.NoError(t, app.DB().NewQuery("SELECT content FROM todos WHERE id = 'external'").Row(&content))
	assert.Equal(t, "unrelated data", content)
	_, err = app.FindCollectionByNameOrId(accountCollection)
	assert.Error(t, err)
}

func TestDataPersistsAcrossRestart(t *testing.T) {
	dir := t.TempDir()
	app := newTestApp(t, dir)
	accounts, err := app.FindCollectionByNameOrId(accountCollection)
	require.NoError(t, err)
	account := core.NewRecord(accounts)
	account.Set("username", "persisted")
	account.SetPassword("password123")
	require.NoError(t, app.Save(account))
	todo, err := newUserRecord(app, todoCollection, account.Id)
	require.NoError(t, err)
	todo.Set("content", "preserved")
	require.NoError(t, app.Save(todo))
	require.NoError(t, app.ResetBootstrapState())

	reopened := newTestApp(t, dir)
	defer reopened.ResetBootstrapState()
	saved, err := reopened.FindRecordById(todoCollection, todo.Id)
	require.NoError(t, err)
	assert.Equal(t, "preserved", saved.GetString("content"))
	record, err := reopened.FindFirstRecordByData(accountCollection, "username", "persisted")
	require.NoError(t, err)
	assert.True(t, record.ValidatePassword("password123"))
}
