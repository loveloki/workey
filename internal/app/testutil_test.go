package app

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	_ "workey/migrations"
)

// 测试使用真实 PocketBase 临时数据目录（含迁移）和完整路由，handler 经由 RequireAuth 获取身份。
var (
	testApp     core.App
	testHandler http.Handler
)

func newTestApp(t *testing.T, dataDir string) core.App {
	t.Helper()
	app := core.NewBaseApp(core.BaseAppConfig{DataDir: dataDir})
	if err := app.Bootstrap(); err != nil {
		t.Fatalf("bootstrap PocketBase: %v", err)
	}
	if err := app.RunAllMigrations(); err != nil {
		t.Fatalf("run migrations: %v", err)
	}
	return app
}

func newTestHandler(t *testing.T, app core.App) http.Handler {
	t.Helper()
	r, err := apis.NewRouter(app)
	if err != nil {
		t.Fatalf("create router: %v", err)
	}
	registerRoutes(r)
	handler, err := r.BuildMux()
	if err != nil {
		t.Fatalf("build router: %v", err)
	}
	return handler
}

func setupTestDB(t *testing.T) func() {
	t.Helper()
	testApp = newTestApp(t, t.TempDir())
	testHandler = newTestHandler(t, testApp)
	return func() {
		if err := testApp.ResetBootstrapState(); err != nil {
			t.Errorf("reset PocketBase: %v", err)
		}
		testApp, testHandler = nil, nil
	}
}

func createTestUser(t *testing.T, username, password string) string {
	t.Helper()
	collection, err := testApp.FindCollectionByNameOrId(accountCollection)
	if err != nil {
		t.Fatal(err)
	}
	record := core.NewRecord(collection)
	record.Set("username", username)
	record.SetPassword(password)
	if err := testApp.Save(record); err != nil {
		t.Fatalf("create PocketBase account: %v", err)
	}
	return record.Id
}

func testAccount(t *testing.T, userID string) *core.Record {
	t.Helper()
	record, err := testApp.FindRecordById(accountCollection, userID)
	if err != nil {
		t.Fatal(err)
	}
	return record
}

func createAuthenticatedRequest(t *testing.T, method, url string, body string, userID string) *http.Request {
	t.Helper()
	req := httptest.NewRequest(method, url, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	token, err := testAccount(t, userID).NewAuthToken()
	if err != nil {
		t.Fatalf("create PocketBase auth token: %v", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	return req
}

func serveTest(w http.ResponseWriter, req *http.Request) {
	testHandler.ServeHTTP(w, req)
}

// insertTestRecord 直接保存一条属于 userID 的业务记录。
func insertTestRecord(t *testing.T, collection, userID string, fields map[string]any) *core.Record {
	t.Helper()
	record, err := newUserRecord(testApp, collection, userID)
	if err != nil {
		t.Fatal(err)
	}
	for key, value := range fields {
		record.Set(key, value)
	}
	if err := testApp.Save(record); err != nil {
		t.Fatalf("insert %s: %v", collection, err)
	}
	return record
}
