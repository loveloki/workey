package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestHandleRegister(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	t.Run("注册成功", func(t *testing.T) {
		body := `{"username":"newuser","password":"password123"}`
		req := httptest.NewRequest("POST", "/api/auth/register", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handleRegister(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var resp AuthResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.NotEmpty(t, resp.Token)
		assert.Equal(t, "newuser", resp.User.Username)
	})

	t.Run("用户名重复", func(t *testing.T) {
		body := `{"username":"newuser","password":"password456"}`
		req := httptest.NewRequest("POST", "/api/auth/register", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handleRegister(rr, req)

		assert.Equal(t, http.StatusConflict, rr.Code)
	})

	t.Run("缺少用户名", func(t *testing.T) {
		body := `{"username":"","password":"password123"}`
		req := httptest.NewRequest("POST", "/api/auth/register", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handleRegister(rr, req)

		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("密码太短", func(t *testing.T) {
		body := `{"username":"short","password":"123"}`
		req := httptest.NewRequest("POST", "/api/auth/register", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handleRegister(rr, req)

		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("GET 方法不允许", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/auth/register", nil)
		rr := httptest.NewRecorder()

		handleRegister(rr, req)

		assert.Equal(t, http.StatusMethodNotAllowed, rr.Code)
	})
}

func TestHandleLogin(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	createTestUser(t, "loginuser", "correctpass")

	t.Run("登录成功", func(t *testing.T) {
		body := `{"username":"loginuser","password":"correctpass"}`
		req := httptest.NewRequest("POST", "/api/auth/login", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handleLogin(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var resp AuthResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.NotEmpty(t, resp.Token)
	})

	t.Run("密码错误", func(t *testing.T) {
		body := `{"username":"loginuser","password":"wrongpass"}`
		req := httptest.NewRequest("POST", "/api/auth/login", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handleLogin(rr, req)

		assert.Equal(t, http.StatusUnauthorized, rr.Code)
	})

	t.Run("用户不存在", func(t *testing.T) {
		body := `{"username":"nonexistent","password":"whatever"}`
		req := httptest.NewRequest("POST", "/api/auth/login", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handleLogin(rr, req)

		assert.Equal(t, http.StatusUnauthorized, rr.Code)
	})
}

func TestHandleMe(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "meuser", "password123")

	t.Run("获取当前用户信息", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "GET", "/api/auth/me", "", userID)
		rr := httptest.NewRecorder()

		handleMe(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var resp MeResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.Equal(t, "meuser", resp.User.Username)
	})
}

func TestHandleChangePassword(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "cpuser", "oldpassword")

	t.Run("成功修改密码", func(t *testing.T) {
		body := `{"old_password":"oldpassword","new_password":"newpassword"}`
		req := createAuthenticatedRequest(t, "POST", "/api/auth/change-password", body, userID)
		rr := httptest.NewRecorder()

		handleChangePassword(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		// 验证新密码可以登录
		var hash string
		db.QueryRow("SELECT password_hash FROM users WHERE id = ?", userID).Scan(&hash)
		assert.True(t, checkPassword("newpassword", hash))
	})

	t.Run("旧密码错误", func(t *testing.T) {
		body := `{"old_password":"wrongold","new_password":"newpassword"}`
		req := createAuthenticatedRequest(t, "POST", "/api/auth/change-password", body, userID)
		rr := httptest.NewRecorder()

		handleChangePassword(rr, req)

		assert.Equal(t, http.StatusUnauthorized, rr.Code)
	})

	t.Run("新密码太短", func(t *testing.T) {
		body := `{"old_password":"newpassword","new_password":"123"}`
		req := createAuthenticatedRequest(t, "POST", "/api/auth/change-password", body, userID)
		rr := httptest.NewRecorder()

		handleChangePassword(rr, req)

		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("缺少密码字段", func(t *testing.T) {
		body := `{"old_password":"","new_password":""}`
		req := createAuthenticatedRequest(t, "POST", "/api/auth/change-password", body, userID)
		rr := httptest.NewRecorder()

		handleChangePassword(rr, req)

		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("GET 方法不允许", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "GET", "/api/auth/change-password", "", userID)
		rr := httptest.NewRecorder()

		handleChangePassword(rr, req)

		assert.Equal(t, http.StatusMethodNotAllowed, rr.Code)
	})
}

func TestHandleMe_MethodNotAllowed(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "mepost", "password123")

	req := createAuthenticatedRequest(t, "POST", "/api/auth/me", "", userID)
	rr := httptest.NewRecorder()

	handleMe(rr, req)

	assert.Equal(t, http.StatusMethodNotAllowed, rr.Code)
}

func TestHandleLogin_InvalidJSON(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	req := httptest.NewRequest("POST", "/api/auth/login", strings.NewReader("not json"))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	handleLogin(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestHandleRegister_InvalidJSON(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	req := httptest.NewRequest("POST", "/api/auth/register", strings.NewReader("bad"))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	handleRegister(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}
