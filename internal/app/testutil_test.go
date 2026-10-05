package app

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// setupTestDB 使用真实 PocketBase 临时目录验证迁移、记录认证与业务查询。
func setupTestDB(t *testing.T) func() {
	t.Helper()
	previousApp, previousDB, previousDir, previousSecret := pbApp, db, dataDir, dataEncryptionSecret
	pb := New(t.TempDir())
	if err := pb.Bootstrap(); err != nil {
		t.Fatalf("bootstrap PocketBase: %v", err)
	}
	return func() {
		if err := pb.ClearBootstrap(); err != nil {
			t.Errorf("clear PocketBase: %v", err)
		}
		pbApp, db, dataDir, dataEncryptionSecret = previousApp, previousDB, previousDir, previousSecret
	}
}

func createTestUser(t *testing.T, username, password string) int64 {
	t.Helper()
	user, err := createAccount(username, password)
	if err != nil {
		t.Fatalf("create PocketBase account: %v", err)
	}
	return user.ID
}

func createAuthenticatedRequest(t *testing.T, method, url string, body string, userID int64) *http.Request {
	t.Helper()
	req := httptest.NewRequest(method, url, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	token, err := createJWT(userID)
	if err != nil {
		t.Fatalf("create PocketBase auth token: %v", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	ctx := context.WithValue(req.Context(), userIDKey, userID)
	return req.WithContext(ctx)
}
