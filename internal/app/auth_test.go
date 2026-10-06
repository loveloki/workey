package app

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// 业务路由只接受 workey_accounts 的 auth token，鉴权完全交给 PocketBase。
func TestProtectedRoutesRequireWorkeyAccountToken(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := createTestUser(t, "tokenuser", "password123")
	account := testAccount(t, userID)

	request := func(token string) int {
		req := httptest.NewRequest(http.MethodGet, "/api/workey/todos", nil)
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		rr := httptest.NewRecorder()
		serveTest(rr, req)
		return rr.Code
	}

	token, err := account.NewAuthToken()
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, request(token))
	assert.Equal(t, http.StatusUnauthorized, request(""))
	assert.Equal(t, http.StatusUnauthorized, request("not-a-token"))

	// 非 auth 类型的 token（如邮箱验证 token）不能用于访问。
	verification, err := account.NewVerificationToken()
	require.NoError(t, err)
	assert.Equal(t, http.StatusUnauthorized, request(verification))

	// 超级管理员 token 也不能冒充业务用户。
	superusers, err := testApp.FindCollectionByNameOrId(core.CollectionNameSuperusers)
	require.NoError(t, err)
	superuser := core.NewRecord(superusers)
	superuser.SetEmail("admin@example.com")
	superuser.SetPassword("password123456")
	require.NoError(t, testApp.Save(superuser))
	superToken, err := superuser.NewAuthToken()
	require.NoError(t, err)
	assert.Equal(t, http.StatusForbidden, request(superToken))

	// 删除账号后 token 失效。
	require.NoError(t, testApp.Delete(account))
	assert.Equal(t, http.StatusUnauthorized, request(token))
}
