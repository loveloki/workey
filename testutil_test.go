package main

import (
	"database/sql"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	_ "modernc.org/sqlite"
)

// setupTestDB 创建内存中的 SQLite 测试数据库并初始化所有表
func setupTestDB(t *testing.T) func() {
	t.Helper()

	var err error
	db, err = sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("failed to open test db: %v", err)
	}

	db.Exec("PRAGMA journal_mode=WAL")
	db.Exec("PRAGMA foreign_keys=ON")

	initDB()
	initPasskeyDB()

	jwtSecret = []byte("test-jwt-secret-for-unit-tests")

	return func() {
		db.Close()
	}
}

// createTestUser 在测试数据库中创建一个测试用户，返回用户 ID
func createTestUser(t *testing.T, username, password string) int64 {
	t.Helper()
	hash, err := hashPassword(password)
	if err != nil {
		t.Fatalf("failed to hash password: %v", err)
	}
	result, err := db.Exec("INSERT INTO users (username, password_hash) VALUES (?, ?)", username, hash)
	if err != nil {
		t.Fatalf("failed to create test user: %v", err)
	}
	id, _ := result.LastInsertId()
	return id
}

// createAuthenticatedRequest 创建带有有效 JWT token 和 X-User-ID 头的 HTTP 请求
func createAuthenticatedRequest(t *testing.T, method, url string, body string, userID int64) *http.Request {
	t.Helper()
	var req *http.Request
	if body != "" {
		req = httptest.NewRequest(method, url, strings.NewReader(body))
	} else {
		req = httptest.NewRequest(method, url, nil)
	}
	req.Header.Set("Content-Type", "application/json")

	token, err := createJWT(userID)
	if err != nil {
		t.Fatalf("failed to create JWT: %v", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("X-User-ID", fmt.Sprintf("%d", userID))
	return req
}

func init() {
	if os.Getenv("WORKEY_DATA") == "" {
		dataDir = os.TempDir()
	}
}
