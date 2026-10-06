package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// 看板链接功能已移除，账号上不再保留 kanban_url 字段。
func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("workey_accounts")
		if err != nil {
			return err
		}
		collection.Fields.RemoveByName("kanban_url")
		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("workey_accounts")
		if err != nil {
			return err
		}
		collection.Fields.Add(&core.TextField{Name: "kanban_url", Max: 2000})
		return app.Save(collection)
	})
}
