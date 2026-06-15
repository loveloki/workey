package app

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestHandleVapidKey(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	t.Run("获取 VAPID 公钥", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/push/vapid-key", nil)
		rr := httptest.NewRecorder()

		handleVapidKey(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var resp VapidKeyResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.NotEmpty(t, resp.PublicKey)
	})

	t.Run("方法不允许", func(t *testing.T) {
		req := httptest.NewRequest("POST", "/api/push/vapid-key", nil)
		rr := httptest.NewRecorder()

		handleVapidKey(rr, req)

		assert.Equal(t, http.StatusMethodNotAllowed, rr.Code)
	})
}

func TestHandlePushSubscribe(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "pushuser", "password123")

	t.Run("订阅成功", func(t *testing.T) {
		body := `{"endpoint":"https://push.example.com/1","p256dh":"abc123","auth":"def456"}`
		req := createAuthenticatedRequest(t, "POST", "/api/push/subscribe", body, userID)
		rr := httptest.NewRecorder()

		handlePushSubscribe(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var resp MessageResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.Equal(t, "ok", resp.Message)
	})

	t.Run("重复订阅相同 endpoint 更新密钥", func(t *testing.T) {
		body := `{"endpoint":"https://push.example.com/1","p256dh":"xyz789","auth":"new456"}`
		req := createAuthenticatedRequest(t, "POST", "/api/push/subscribe", body, userID)
		rr := httptest.NewRecorder()

		handlePushSubscribe(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var count int
		db.QueryRow("SELECT COUNT(*) FROM push_subscriptions WHERE user_id = ? AND endpoint = ?", userID, "https://push.example.com/1").Scan(&count)
		assert.Equal(t, 1, count)
	})

	t.Run("缺少字段返回错误", func(t *testing.T) {
		body := `{"endpoint":"https://push.example.com/2"}`
		req := createAuthenticatedRequest(t, "POST", "/api/push/subscribe", body, userID)
		rr := httptest.NewRecorder()

		handlePushSubscribe(rr, req)

		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("取消指定订阅", func(t *testing.T) {
		db.Exec("INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, 'https://push.example.com/3', 'aaa', 'bbb')", userID)

		body := `{"endpoint":"https://push.example.com/3"}`
		req := createAuthenticatedRequest(t, "DELETE", "/api/push/subscribe", body, userID)
		rr := httptest.NewRecorder()

		handlePushSubscribe(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var count int
		db.QueryRow("SELECT COUNT(*) FROM push_subscriptions WHERE user_id = ? AND endpoint = 'https://push.example.com/3'", userID).Scan(&count)
		assert.Equal(t, 0, count)
	})

	t.Run("取消所有订阅", func(t *testing.T) {
		db.Exec("INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, 'https://push.example.com/4', 'aaa', 'bbb')", userID)
		db.Exec("INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, 'https://push.example.com/5', 'ccc', 'ddd')", userID)

		req := createAuthenticatedRequest(t, "DELETE", "/api/push/subscribe", `{}`, userID)
		rr := httptest.NewRecorder()

		handlePushSubscribe(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var count int
		db.QueryRow("SELECT COUNT(*) FROM push_subscriptions WHERE user_id = ?", userID).Scan(&count)
		assert.Equal(t, 0, count)
	})

	t.Run("方法不允许", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "GET", "/api/push/subscribe", "", userID)
		rr := httptest.NewRecorder()

		handlePushSubscribe(rr, req)

		assert.Equal(t, http.StatusMethodNotAllowed, rr.Code)
	})
}
