package app

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCORSMiddleware(t *testing.T) {
	t.Setenv("WORKEY_ALLOWED_ORIGINS", "https://workey.exe.xyz,http://localhost:3000,*")
	handler := corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	t.Run("普通请求应设置 CORS 头", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/test", nil)
		req.Header.Set("Origin", "https://workey.exe.xyz")
		rr := httptest.NewRecorder()
		handler(rr, req)

		assert.Equal(t, "https://workey.exe.xyz", rr.Header().Get("Access-Control-Allow-Origin"))
		assert.Equal(t, "true", rr.Header().Get("Access-Control-Allow-Credentials"))
		assert.Equal(t, "X-New-Token", rr.Header().Get("Access-Control-Expose-Headers"))
		assert.Contains(t, rr.Header().Get("Vary"), "Origin")
		assert.Contains(t, rr.Header().Get("Access-Control-Allow-Methods"), "GET")
		assert.Contains(t, rr.Header().Get("Access-Control-Allow-Headers"), "Authorization")
		assert.Equal(t, http.StatusOK, rr.Code)
	})

	t.Run("OPTIONS 预检请求应直接返回 200", func(t *testing.T) {
		req := httptest.NewRequest("OPTIONS", "/api/test", nil)
		req.Header.Set("Origin", "http://localhost:3000")
		rr := httptest.NewRecorder()
		handler(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		assert.Equal(t, "http://localhost:3000", rr.Header().Get("Access-Control-Allow-Origin"))
	})

	t.Run("不允许未知来源或通配符", func(t *testing.T) {
		for _, origin := range []string{"", "https://attacker.example", "https://workey.exe.xyz.attacker.example", "*", "null"} {
			for _, method := range []string{"GET", "OPTIONS"} {
				req := httptest.NewRequest(method, "/api/test", nil)
				req.Header.Set("Origin", origin)
				rr := httptest.NewRecorder()
				handler(rr, req)
				assert.Empty(t, rr.Header().Get("Access-Control-Allow-Origin"))
				assert.Empty(t, rr.Header().Get("Access-Control-Allow-Credentials"))
				assert.Equal(t, http.StatusOK, rr.Code)
			}
		}
	})
}

func TestAuthMiddleware_NoToken(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	handler := authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest("GET", "/api/test", nil)
	rr := httptest.NewRecorder()
	handler(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestAuthMiddleware_InvalidToken(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	handler := authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest("GET", "/api/test", nil)
	req.Header.Set("Authorization", "Bearer invalid-token")
	rr := httptest.NewRecorder()
	handler(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestAuthMiddleware_ValidToken(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "testuser", "password123")

	var capturedUserID int64
	handler := authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		capturedUserID = getUserID(r)
		w.WriteHeader(http.StatusOK)
	})

	token, err := createJWT(userID)
	require.NoError(t, err)

	req := httptest.NewRequest("GET", "/api/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rr := httptest.NewRecorder()
	handler(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Equal(t, userID, capturedUserID)
}

func TestAuthMiddleware_RejectsSuperuser(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	token := testSuperuserToken(t)
	handler := authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("superuser token must not reach a Workey handler")
	})
	req := httptest.NewRequest("GET", "/api/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rr := httptest.NewRecorder()
	handler(rr, req)
	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestAuthMiddleware_ProfileDatabaseFailure(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := createTestUser(t, "databasefailureuser", "password123")
	token, err := createJWT(userID)
	require.NoError(t, err)
	_, err = db.Exec("DROP TABLE workey_profiles")
	require.NoError(t, err)
	req := httptest.NewRequest("GET", "/api/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rr := httptest.NewRecorder()
	authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("database failure must not reach a Workey handler")
	})(rr, req)
	assert.Equal(t, http.StatusInternalServerError, rr.Code)
}

func TestAuthMiddleware_RefreshesPocketBaseToken(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	collection, err := pbApp.FindCollectionByNameOrId(accountCollectionName)
	require.NoError(t, err)
	collection.AuthToken.Duration = 3600
	require.NoError(t, pbApp.Save(collection))
	userID := createTestUser(t, "refreshuser", "password123")
	token, err := createJWT(userID)
	require.NoError(t, err)
	req := httptest.NewRequest("GET", "/api/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rr := httptest.NewRecorder()
	authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, userID, getUserID(r))
		w.WriteHeader(http.StatusOK)
	})(rr, req)
	assert.Equal(t, http.StatusOK, rr.Code)
	newToken := rr.Header().Get("X-New-Token")
	require.NotEmpty(t, newToken)
	gotUserID, _, err := validateJWT(newToken)
	require.NoError(t, err)
	assert.Equal(t, userID, gotUserID)
}

func TestAuthMiddleware_RejectsExpiredPocketBaseToken(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := createTestUser(t, "expireduser", "password123")
	record, err := accountForUser(userID)
	require.NoError(t, err)
	token, err := record.NewStaticAuthToken(time.Nanosecond)
	require.NoError(t, err)
	req := httptest.NewRequest("GET", "/api/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rr := httptest.NewRecorder()
	authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("expired token must not reach a Workey handler")
	})(rr, req)
	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestWebAuthnOrigin_UsesAllowedFrontendOrigin(t *testing.T) {
	t.Setenv("WORKEY_ALLOWED_ORIGINS", "https://workey.exe.xyz,http://localhost:3000,http://[::1]:3000")
	for _, tc := range []struct {
		origin string
		rpID   string
	}{
		{"https://workey.exe.xyz", "workey.exe.xyz"},
		{"http://localhost:3000", "localhost"},
		{"http://[::1]:3000", "::1"},
	} {
		t.Run(tc.origin, func(t *testing.T) {
			req := httptest.NewRequest("GET", "https://pockethost.exe.xyz/api/passkey/auth/begin", nil)
			req.Header.Set("Origin", tc.origin)
			assert.Equal(t, tc.origin, getOrigin(req))
			assert.Equal(t, tc.rpID, getRPID(req))
			wa, err := getWebAuthn(req)
			require.NoError(t, err)
			assert.Equal(t, tc.rpID, wa.Config.RPID)
			assert.Equal(t, []string{tc.origin}, wa.Config.RPOrigins)
		})
	}
}

func TestWebAuthnOrigin_RejectsDisallowedOrMalformedOrigin(t *testing.T) {
	t.Setenv("WORKEY_ALLOWED_ORIGINS", "https://workey.exe.xyz,http://not-loopback.example,https://workey.exe.xyz/path,https://user@workey.exe.xyz")
	for _, origin := range []string{
		"", "null", "*", "https://attacker.example", "https://workey.exe.xyz.attacker.example",
		"http://not-loopback.example", "https://workey.exe.xyz/path", "https://user@workey.exe.xyz",
	} {
		t.Run(origin, func(t *testing.T) {
			req := httptest.NewRequest("POST", "https://pockethost.exe.xyz/api/passkey/auth/begin", nil)
			req.Header.Set("Origin", origin)
			assert.Empty(t, getOrigin(req))
			assert.Empty(t, getRPID(req))
			_, err := getWebAuthn(req)
			assert.ErrorIs(t, err, errWebAuthnOrigin)
			rr := httptest.NewRecorder()
			handlePasskeyAuthBegin(rr, req)
			assert.Equal(t, http.StatusBadRequest, rr.Code)
		})
	}
}

func TestGetUserID(t *testing.T) {
	req := httptest.NewRequest("GET", "/test", nil)
	ctx := context.WithValue(req.Context(), userIDKey, int64(42))
	req = req.WithContext(ctx)
	assert.Equal(t, int64(42), getUserID(req))
}

func TestGetUserID_Missing(t *testing.T) {
	req := httptest.NewRequest("GET", "/test", nil)
	assert.Equal(t, int64(0), getUserID(req))
}
