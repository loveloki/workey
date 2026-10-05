package app

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
		assert.Positive(t, resp.User.ID)
		assert.NotEmpty(t, resp.User.CreatedAt)
		tokenUserID, _, err := validateJWT(resp.Token)
		require.NoError(t, err)
		assert.Equal(t, resp.User.ID, tokenUserID)
		assert.NotContains(t, rr.Body.String(), "password")
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

	t.Run("PB密码字段校验失败", func(t *testing.T) {
		body, err := json.Marshal(struct {
			Username string `json:"username"`
			Password string `json:"password"`
		}{Username: "toolongpassword", Password: strings.Repeat("a", 100)})
		require.NoError(t, err)
		req := httptest.NewRequest("POST", "/api/auth/register", strings.NewReader(string(body)))
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

	t.Run("用户名不能注入查询", func(t *testing.T) {
		for _, username := range []string{`loginuser' OR 1=1 --`, `loginuser" || username != "" || username = "`} {
			body, err := json.Marshal(struct {
				Username string `json:"username"`
				Password string `json:"password"`
			}{Username: username, Password: "correctpass"})
			require.NoError(t, err)
			req := httptest.NewRequest("POST", "/api/auth/login", strings.NewReader(string(body)))
			rr := httptest.NewRecorder()
			handleLogin(rr, req)
			assert.Equal(t, http.StatusUnauthorized, rr.Code)
		}
	})

	t.Run("缺少身份字段", func(t *testing.T) {
		for _, body := range []string{`{"username":"","password":"correctpass"}`, `{"username":"loginuser","password":""}`} {
			req := httptest.NewRequest("POST", "/api/auth/login", strings.NewReader(body))
			rr := httptest.NewRecorder()
			handleLogin(rr, req)
			assert.Equal(t, http.StatusBadRequest, rr.Code)
		}
	})

	t.Run("GET方法不允许", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/auth/login", nil)
		rr := httptest.NewRecorder()
		handleLogin(rr, req)
		assert.Equal(t, http.StatusMethodNotAllowed, rr.Code)
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
		oldToken := strings.TrimPrefix(req.Header.Get("Authorization"), "Bearer ")
		rr := httptest.NewRecorder()

		authMiddleware(handleChangePassword)(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		valid, err := validateUserPassword(userID, "newpassword")
		require.NoError(t, err)
		assert.True(t, valid)
		valid, err = validateUserPassword(userID, "oldpassword")
		require.NoError(t, err)
		assert.False(t, valid)
		_, _, err = validateJWT(oldToken)
		assert.ErrorIs(t, err, errInvalidToken)
		newToken := rr.Header().Get("X-New-Token")
		require.NotEmpty(t, newToken)
		assert.NotEqual(t, oldToken, newToken)
		tokenUserID, _, err := validateJWT(newToken)
		require.NoError(t, err)
		assert.Equal(t, userID, tokenUserID)

		meReq := httptest.NewRequest("GET", "/api/auth/me", nil)
		meReq.Header.Set("Authorization", "Bearer "+newToken)
		meRecorder := httptest.NewRecorder()
		authMiddleware(handleMe)(meRecorder, meReq)
		assert.Equal(t, http.StatusOK, meRecorder.Code)
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

	t.Run("PB新密码校验失败不吊销原token", func(t *testing.T) {
		body, err := json.Marshal(struct {
			OldPassword string `json:"old_password"`
			NewPassword string `json:"new_password"`
		}{OldPassword: "newpassword", NewPassword: strings.Repeat("a", 100)})
		require.NoError(t, err)
		req := createAuthenticatedRequest(t, "POST", "/api/auth/change-password", string(body), userID)
		token := strings.TrimPrefix(req.Header.Get("Authorization"), "Bearer ")
		rr := httptest.NewRecorder()
		handleChangePassword(rr, req)
		assert.Equal(t, http.StatusBadRequest, rr.Code)
		_, _, err = validateJWT(token)
		require.NoError(t, err)
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

func TestHandleRegister_ProfileDatabaseFailure(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	_, err := db.Exec(`CREATE TRIGGER reject_registration_profile BEFORE INSERT ON workey_profiles
		BEGIN SELECT RAISE(ABORT, 'profile write failed'); END`)
	require.NoError(t, err)
	req := httptest.NewRequest("POST", "/api/auth/register", strings.NewReader(`{"username":"failedregistration","password":"password123"}`))
	rr := httptest.NewRecorder()
	handleRegister(rr, req)
	assert.Equal(t, http.StatusInternalServerError, rr.Code)
	var count int
	require.NoError(t, db.QueryRow("SELECT COUNT(*) FROM workey_accounts").Scan(&count))
	assert.Zero(t, count)
}
