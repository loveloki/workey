package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-webauthn/webauthn/webauthn"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestWebAuthnUser(t *testing.T) {
	user := &WebAuthnUser{
		id:          42,
		name:        "testuser",
		credentials: []webauthn.Credential{{ID: []byte("cred1")}},
	}

	assert.Equal(t, []byte("42"), user.WebAuthnID())
	assert.Equal(t, "testuser", user.WebAuthnName())
	assert.Equal(t, "testuser", user.WebAuthnDisplayName())
	assert.Len(t, user.WebAuthnCredentials(), 1)
}

func TestGetRPID(t *testing.T) {
	tests := []struct {
		host     string
		expected string
	}{
		{"localhost:8000", "localhost"},
		{"example.com:443", "example.com"},
		{"example.com", "example.com"},
		{"127.0.0.1:3000", "127.0.0.1"},
	}

	for _, tt := range tests {
		t.Run(tt.host, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/", nil)
			req.Host = tt.host
			assert.Equal(t, tt.expected, getRPID(req))
		})
	}
}

func TestGetOrigin(t *testing.T) {
	tests := []struct {
		host     string
		expected string
	}{
		{"localhost:8000", "http://localhost:8000"},
		{"127.0.0.1:3000", "http://127.0.0.1:3000"},
		{"example.com:443", "https://example.com:443"},
		{"example.com", "https://example.com"},
	}

	for _, tt := range tests {
		t.Run(tt.host, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/", nil)
			req.Host = tt.host
			assert.Equal(t, tt.expected, getOrigin(req))
		})
	}
}

func TestGenerateChallengeID(t *testing.T) {
	id1 := generateChallengeID()
	id2 := generateChallengeID()

	assert.NotEmpty(t, id1)
	assert.NotEmpty(t, id2)
	assert.NotEqual(t, id1, id2)
}

func TestSessionStorage(t *testing.T) {
	sessionMu.Lock()
	registerSessions = map[int64]sessionEntry{}
	authSessions = map[string]sessionEntry{}
	sessionMu.Unlock()

	t.Run("register session 存取", func(t *testing.T) {
		sd := &webauthn.SessionData{Challenge: "test-challenge"}
		storeRegisterSession(1, sd)

		got, ok := getRegisterSession(1)
		assert.True(t, ok)
		assert.Equal(t, "test-challenge", got.Challenge)

		// 获取后应被删除
		_, ok = getRegisterSession(1)
		assert.False(t, ok)
	})

	t.Run("auth session 存取", func(t *testing.T) {
		sd := &webauthn.SessionData{Challenge: "auth-challenge"}
		storeAuthSession("cid-1", sd)

		got, ok := getAuthSession("cid-1")
		assert.True(t, ok)
		assert.Equal(t, "auth-challenge", got.Challenge)

		_, ok = getAuthSession("cid-1")
		assert.False(t, ok)
	})

	t.Run("过期的 session 返回 false", func(t *testing.T) {
		sessionMu.Lock()
		registerSessions[99] = sessionEntry{
			Session:   &webauthn.SessionData{Challenge: "expired"},
			ExpiresAt: time.Now().Add(-1 * time.Minute),
		}
		sessionMu.Unlock()

		_, ok := getRegisterSession(99)
		assert.False(t, ok)
	})

	t.Run("不存在的 session 返回 false", func(t *testing.T) {
		_, ok := getRegisterSession(999)
		assert.False(t, ok)

		_, ok = getAuthSession("nonexistent")
		assert.False(t, ok)
	})
}

func TestCleanExpiredSessions(t *testing.T) {
	sessionMu.Lock()
	registerSessions = map[int64]sessionEntry{
		1: {Session: &webauthn.SessionData{}, ExpiresAt: time.Now().Add(-1 * time.Hour)},
		2: {Session: &webauthn.SessionData{}, ExpiresAt: time.Now().Add(1 * time.Hour)},
	}
	authSessions = map[string]sessionEntry{
		"a": {Session: &webauthn.SessionData{}, ExpiresAt: time.Now().Add(-1 * time.Hour)},
		"b": {Session: &webauthn.SessionData{}, ExpiresAt: time.Now().Add(1 * time.Hour)},
	}
	cleanExpiredSessions()
	sessionMu.Unlock()

	sessionMu.Lock()
	defer sessionMu.Unlock()
	assert.Len(t, registerSessions, 1)
	assert.Contains(t, registerSessions, int64(2))
	assert.Len(t, authSessions, 1)
	assert.Contains(t, authSessions, "b")
}

func TestGetWebAuthn(t *testing.T) {
	waInstancesMu.Lock()
	waInstances = map[string]*webauthn.WebAuthn{}
	waInstancesMu.Unlock()

	req := httptest.NewRequest("GET", "/", nil)
	req.Host = "test.example.com"

	wa, err := getWebAuthn(req)
	require.NoError(t, err)
	require.NotNil(t, wa)

	// 再次获取应复用缓存
	wa2, err := getWebAuthn(req)
	require.NoError(t, err)
	assert.Equal(t, wa, wa2)
}

func TestLoadWebAuthnUser(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "wauser", "password123")

	user, err := loadWebAuthnUser(userID)
	require.NoError(t, err)
	assert.Equal(t, "wauser", user.name)
	assert.Empty(t, user.credentials)
}

func TestLoadCredentials(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "creduser", "password123")

	// 插入测试凭证
	db.Exec("INSERT INTO passkeys (user_id, name, credential_id, public_key, sign_count, created_at) VALUES (?, 'test', ?, ?, 0, datetime('now'))",
		userID, []byte("test-cred-id"), []byte("test-public-key"))

	creds := loadCredentials(userID)
	assert.Len(t, creds, 1)
	assert.Equal(t, []byte("test-cred-id"), creds[0].ID)
}

func TestHandlePasskeyList(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "listuser", "password123")

	// 插入测试 passkey
	db.Exec("INSERT INTO passkeys (user_id, name, credential_id, public_key, sign_count, created_at) VALUES (?, 'My Key', ?, ?, 0, datetime('now'))",
		userID, []byte("cred-id"), []byte("pub-key"))

	req := createAuthenticatedRequest(t, "GET", "/api/passkeys", "", userID)
	rr := httptest.NewRecorder()

	handlePasskeys(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)

	var resp PasskeyListResponse
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	assert.Len(t, resp.Passkeys, 1)
	assert.Equal(t, "My Key", resp.Passkeys[0].Name)
}

func TestHandlePasskeyDelete(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "deluser2", "password123")

	result, _ := db.Exec("INSERT INTO passkeys (user_id, name, credential_id, public_key, sign_count, created_at) VALUES (?, 'To Delete', ?, ?, 0, datetime('now'))",
		userID, []byte("del-cred-id"), []byte("del-pub-key"))
	pkID, _ := result.LastInsertId()

	t.Run("删除已有 passkey", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "DELETE", fmt.Sprintf("/api/passkeys?id=%d", pkID), "", userID)
		rr := httptest.NewRecorder()

		handlePasskeys(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
	})

	t.Run("删除不存在的 passkey", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "DELETE", "/api/passkeys?id=99999", "", userID)
		rr := httptest.NewRecorder()

		handlePasskeys(rr, req)

		assert.Equal(t, http.StatusNotFound, rr.Code)
	})

	t.Run("缺少 id 参数", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "DELETE", "/api/passkeys", "", userID)
		rr := httptest.NewRecorder()

		handlePasskeys(rr, req)

		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})
}

func TestHandlePasskeyMethodNotAllowed(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "pkmethod", "password123")

	req := createAuthenticatedRequest(t, "PUT", "/api/passkeys", "", userID)
	rr := httptest.NewRecorder()

	handlePasskeys(rr, req)

	assert.Equal(t, http.StatusMethodNotAllowed, rr.Code)
}

func TestHandlePasskeyRegisterBegin_MethodNotAllowed(t *testing.T) {
	req := httptest.NewRequest("GET", "/api/passkeys/register/begin", nil)
	rr := httptest.NewRecorder()

	handlePasskeyRegisterBegin(rr, req)

	assert.Equal(t, http.StatusMethodNotAllowed, rr.Code)
}

func TestHandlePasskeyRegisterFinish_MethodNotAllowed(t *testing.T) {
	req := httptest.NewRequest("GET", "/api/passkeys/register/finish", nil)
	rr := httptest.NewRecorder()

	handlePasskeyRegisterFinish(rr, req)

	assert.Equal(t, http.StatusMethodNotAllowed, rr.Code)
}

func TestHandlePasskeyAuthBegin_MethodNotAllowed(t *testing.T) {
	req := httptest.NewRequest("GET", "/api/passkeys/auth/begin", nil)
	rr := httptest.NewRecorder()

	handlePasskeyAuthBegin(rr, req)

	assert.Equal(t, http.StatusMethodNotAllowed, rr.Code)
}

func TestHandlePasskeyAuthFinish_MethodNotAllowed(t *testing.T) {
	req := httptest.NewRequest("GET", "/api/passkeys/auth/finish", nil)
	rr := httptest.NewRecorder()

	handlePasskeyAuthFinish(rr, req)

	assert.Equal(t, http.StatusMethodNotAllowed, rr.Code)
}

func TestHandlePasskeyRegisterBegin_ValidRequest(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	// 清理 WebAuthn 缓存
	waInstancesMu.Lock()
	waInstances = map[string]*webauthn.WebAuthn{}
	waInstancesMu.Unlock()

	userID := createTestUser(t, "regbegin", "password123")

	req := createAuthenticatedRequest(t, "POST", "/api/passkeys/register/begin", "", userID)
	req.Host = "localhost:8000"
	rr := httptest.NewRecorder()

	handlePasskeyRegisterBegin(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)

	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	assert.Contains(t, resp, "challenge")
}

func TestHandlePasskeyAuthBegin_ValidRequest(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	waInstancesMu.Lock()
	waInstances = map[string]*webauthn.WebAuthn{}
	waInstancesMu.Unlock()

	req := httptest.NewRequest("POST", "/api/passkeys/auth/begin", nil)
	req.Host = "localhost:8000"
	rr := httptest.NewRecorder()

	handlePasskeyAuthBegin(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)

	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	assert.Contains(t, resp, "challenge")
	assert.Contains(t, resp, "challengeId")
}

func TestHandlePasskeyRegisterFinish_NoSession(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	// 清空 sessions
	sessionMu.Lock()
	registerSessions = map[int64]sessionEntry{}
	sessionMu.Unlock()

	userID := createTestUser(t, "regfinish", "password123")

	req := createAuthenticatedRequest(t, "POST", "/api/passkeys/register/finish", `{}`, userID)
	req.Host = "localhost:8000"
	rr := httptest.NewRecorder()

	handlePasskeyRegisterFinish(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestHandlePasskeyAuthFinish_NoChallengeID(t *testing.T) {
	req := httptest.NewRequest("POST", "/api/passkeys/auth/finish", strings.NewReader(`{}`))
	req.Host = "localhost:8000"
	rr := httptest.NewRecorder()

	handlePasskeyAuthFinish(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestHandlePasskeyAuthFinish_ExpiredSession(t *testing.T) {
	sessionMu.Lock()
	authSessions = map[string]sessionEntry{}
	sessionMu.Unlock()

	req := httptest.NewRequest("POST", "/api/passkeys/auth/finish", strings.NewReader(`{"challengeId":"nonexistent"}`))
	req.Host = "localhost:8000"
	rr := httptest.NewRecorder()

	handlePasskeyAuthFinish(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}
