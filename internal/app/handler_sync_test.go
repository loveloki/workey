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

// --- 辅助：假 WebDAV 服务器 ---

// fakeWebDAV 启动一个简单的内存 WebDAV stub，支持 PUT/GET/OPTIONS/MKCOL
func fakeWebDAV(t *testing.T) (*httptest.Server, map[string][]byte) {
	t.Helper()
	files := map[string][]byte{}
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/")
		switch r.Method {
		case "OPTIONS":
			w.WriteHeader(200)
		case "MKCOL":
			w.WriteHeader(201)
		case "PUT":
			body := make([]byte, r.ContentLength)
			r.Body.Read(body)
			r.Body.Close()
			files[path] = body
			w.WriteHeader(201)
		case "GET":
			data, ok := files[path]
			if !ok {
				w.WriteHeader(404)
				return
			}
			w.Write(data)
		case "DELETE":
			delete(files, path)
			w.WriteHeader(204)
		default:
			w.WriteHeader(405)
		}
	}))
	t.Cleanup(ts.Close)
	return ts, files
}

// saveSyncConfig 直接写入加密配置到 DB（绕过 HTTP）
func saveSyncConfigDirect(t *testing.T, userID int64, url, username, password string) {
	t.Helper()
	key := getEncKey()
	passEnc, err := encryptField(key, password, aadWebDAVPassword)
	require.NoError(t, err)
	now := nowDatetime()
	_, err = db.Exec(
		`INSERT INTO sync_config (user_id, webdav_url, webdav_username, webdav_password_enc, remote_path, created_at, updated_at)
		 VALUES (?, ?, ?, ?, '', ?, ?)
		 ON CONFLICT(user_id) DO UPDATE SET
			webdav_url=excluded.webdav_url, webdav_username=excluded.webdav_username,
			webdav_password_enc=excluded.webdav_password_enc, remote_path=excluded.remote_path,
			updated_at=excluded.updated_at`,
		userID, url, username, passEnc, now, now,
	)
	require.NoError(t, err)
}

// insertTestAttendance 向数据库插入一条测试考勤记录
func insertTestAttendance(t *testing.T, userID int64, date string) {
	t.Helper()
	_, err := db.Exec(
		"INSERT INTO attendance (user_id, date, status) VALUES (?, ?, 'normal')",
		userID, date,
	)
	require.NoError(t, err)
}

// --- GET /api/sync/config ---

func TestHandleSyncConfigGet_NotConfigured(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := createTestUser(t, "u1", "pass")

	req := createAuthenticatedRequest(t, "GET", "/api/sync/config", "", userID)
	w := httptest.NewRecorder()
	handleSyncConfigGet(w, req)

	assert.Equal(t, 200, w.Code)
	var resp SyncConfigResponse
	require.NoError(t, json.NewDecoder(w.Body).Decode(&resp))
	assert.False(t, resp.Configured)
}

func TestHandleSyncConfigGet_Configured(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := createTestUser(t, "u1", "pass")
	saveSyncConfigDirect(t, userID, "https://dav.example.com", "alice", "s3cr3t")

	req := createAuthenticatedRequest(t, "GET", "/api/sync/config", "", userID)
	w := httptest.NewRecorder()
	handleSyncConfigGet(w, req)

	assert.Equal(t, 200, w.Code)
	var resp SyncConfigResponse
	require.NoError(t, json.NewDecoder(w.Body).Decode(&resp))
	assert.True(t, resp.Configured)
	assert.Equal(t, "https://dav.example.com", resp.WebDAVURL)
	assert.Equal(t, "alice", resp.WebDAVUsername)
	// 密码字段不应出现在响应中
	assert.NotContains(t, w.Body.String(), "s3cr3t")
}

// --- POST /api/sync/config ---

func TestHandleSyncConfigPost_OK(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := createTestUser(t, "u1", "pass")

	body := `{"webdav_url":"https://dav.test","webdav_username":"bob","webdav_password":"pw123","remote_path":"workey"}`
	req := createAuthenticatedRequest(t, "POST", "/api/sync/config", body, userID)
	w := httptest.NewRecorder()
	handleSyncConfigPost(w, req)

	assert.Equal(t, 200, w.Code)
	var resp SyncConfigResponse
	require.NoError(t, json.NewDecoder(w.Body).Decode(&resp))
	assert.True(t, resp.Configured)
	assert.Equal(t, "https://dav.test", resp.WebDAVURL)

	// 验证密码已加密入库（数据库中不应存明文）
	var passEnc string
	db.QueryRow("SELECT webdav_password_enc FROM sync_config WHERE user_id = ?", userID).Scan(&passEnc)
	assert.NotEqual(t, "pw123", passEnc)
	assert.NotEmpty(t, passEnc)

	// 能解密回来
	key := getEncKey()
	decrypted, err := decryptField(key, passEnc, aadWebDAVPassword)
	require.NoError(t, err)
	assert.Equal(t, "pw123", decrypted)
}

func TestHandleSyncConfigPost_MissingFields(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := createTestUser(t, "u1", "pass")

	body := `{"webdav_url":"https://dav.test"}`
	req := createAuthenticatedRequest(t, "POST", "/api/sync/config", body, userID)
	w := httptest.NewRecorder()
	handleSyncConfigPost(w, req)
	assert.Equal(t, 400, w.Code)
}

// --- DELETE /api/sync/config ---

func TestHandleSyncConfigDelete(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := createTestUser(t, "u1", "pass")
	saveSyncConfigDirect(t, userID, "https://dav.test", "u", "p")

	req := createAuthenticatedRequest(t, "DELETE", "/api/sync/config", "", userID)
	w := httptest.NewRecorder()
	handleSyncConfigDelete(w, req)
	assert.Equal(t, 200, w.Code)

	// 配置应已删除
	cfg, _ := getSyncConfig(userID)
	assert.Nil(t, cfg)
}

// --- GET /api/sync/status ---

func TestHandleSyncStatus_NoConfig(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := createTestUser(t, "u1", "pass")

	req := createAuthenticatedRequest(t, "GET", "/api/sync/status", "", userID)
	w := httptest.NewRecorder()
	handleSyncStatus(w, req)

	var resp SyncStatusResponse
	require.NoError(t, json.NewDecoder(w.Body).Decode(&resp))
	assert.False(t, resp.Configured)
	assert.Nil(t, resp.LastSyncAt)
}

func TestHandleSyncStatus_WithState(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := createTestUser(t, "u1", "pass")
	saveSyncConfigDirect(t, userID, "https://dav.test", "u", "p")
	upsertSyncState(userID, "localhash", "remotehash", "push")

	req := createAuthenticatedRequest(t, "GET", "/api/sync/status", "", userID)
	w := httptest.NewRecorder()
	handleSyncStatus(w, req)

	var resp SyncStatusResponse
	require.NoError(t, json.NewDecoder(w.Body).Decode(&resp))
	assert.True(t, resp.Configured)
	require.NotNil(t, resp.LastSyncAt)
	require.NotNil(t, resp.LastDirection)
	assert.Equal(t, "push", *resp.LastDirection)
	assert.Equal(t, "localhash", *resp.LastLocalHash)
}

// --- POST /api/sync/push ---

func TestHandleSyncPush_FirstSync(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := createTestUser(t, "u1", "pass")
	ts, files := fakeWebDAV(t)
	saveSyncConfigDirect(t, userID, ts.URL, "u", "p")
	insertTestAttendance(t, userID, "2024-01-10")

	body := `{}`
	req := createAuthenticatedRequest(t, "POST", "/api/sync/push", body, userID)
	w := httptest.NewRecorder()
	handleSyncPush(w, req)

	assert.Equal(t, 200, w.Code)
	var resp SyncPushResponse
	require.NoError(t, json.NewDecoder(w.Body).Decode(&resp))
	assert.Equal(t, "Push successful", resp.Message)
	assert.NotEmpty(t, resp.LocalHash)

	// manifest 应上传到远端
	assert.Contains(t, files, "manifest.json")
	var m SyncManifest
	json.Unmarshal(files["manifest.json"], &m)
	assert.Equal(t, resp.LocalHash, m.SnapshotHash)

	// sync_state 应已记录
	state, _ := getSyncState(userID)
	require.NotNil(t, state)
	assert.Equal(t, resp.LocalHash, state.LastLocalHash)
	assert.Equal(t, "push", state.Direction)
}

func TestHandleSyncPush_Conflict_Returns409(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := createTestUser(t, "u1", "pass")
	ts, files := fakeWebDAV(t)
	saveSyncConfigDirect(t, userID, ts.URL, "u", "p")
	insertTestAttendance(t, userID, "2024-01-10")

	// 先 push 一次，建立初始同步状态
	req1 := createAuthenticatedRequest(t, "POST", "/api/sync/push", `{}`, userID)
	w1 := httptest.NewRecorder()
	handleSyncPush(w1, req1)
	require.Equal(t, 200, w1.Code)

	// 模拟远端发生了变化（修改 manifest 中的 hash）
	var m SyncManifest
	json.Unmarshal(files["manifest.json"], &m)
	m.SnapshotHash = "different-remote-hash"
	newManifest, _ := json.Marshal(m)
	files["manifest.json"] = newManifest

	// 本地也发生变化
	insertTestAttendance(t, userID, "2024-01-11")

	// 再次 push（无 force）应返回 409
	req2 := createAuthenticatedRequest(t, "POST", "/api/sync/push", `{}`, userID)
	w2 := httptest.NewRecorder()
	handleSyncPush(w2, req2)
	assert.Equal(t, 409, w2.Code)

	var conflict SyncConflictResponse
	require.NoError(t, json.NewDecoder(w2.Body).Decode(&conflict))
	assert.Contains(t, conflict.Error, "Conflict")
	assert.NotEmpty(t, conflict.CurrentLocalHash)
	assert.NotEmpty(t, conflict.CurrentRemoteHash)
}

func TestHandleSyncPush_ForcePush_OverwritesRemote(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := createTestUser(t, "u1", "pass")
	ts, files := fakeWebDAV(t)
	saveSyncConfigDirect(t, userID, ts.URL, "u", "p")
	insertTestAttendance(t, userID, "2024-01-10")

	// 建立初始状态
	req1 := createAuthenticatedRequest(t, "POST", "/api/sync/push", `{}`, userID)
	httptest.NewRecorder()
	w1 := httptest.NewRecorder()
	handleSyncPush(w1, req1)
	require.Equal(t, 200, w1.Code)

	// 远端 hash 不同
	var m SyncManifest
	json.Unmarshal(files["manifest.json"], &m)
	m.SnapshotHash = "stale-remote"
	newManifest, _ := json.Marshal(m)
	files["manifest.json"] = newManifest

	// 本地也变化
	insertTestAttendance(t, userID, "2024-01-11")

	// force=true 应成功覆盖
	req2 := createAuthenticatedRequest(t, "POST", "/api/sync/push", `{"force":true}`, userID)
	w2 := httptest.NewRecorder()
	handleSyncPush(w2, req2)
	assert.Equal(t, 200, w2.Code)
	var resp SyncPushResponse
	require.NoError(t, json.NewDecoder(w2.Body).Decode(&resp))
	assert.Equal(t, "Push successful", resp.Message)
}

// --- POST /api/sync/pull ---

func TestHandleSyncPull_NoRemoteData(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := createTestUser(t, "u1", "pass")
	ts, _ := fakeWebDAV(t)
	saveSyncConfigDirect(t, userID, ts.URL, "u", "p")

	req := createAuthenticatedRequest(t, "POST", "/api/sync/pull", `{}`, userID)
	w := httptest.NewRecorder()
	handleSyncPull(w, req)
	assert.Equal(t, 400, w.Code)
}

func TestHandleSyncPull_Success(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	// userA push 数据
	userA := createTestUser(t, "userA", "pass")
	ts, _ := fakeWebDAV(t)
	saveSyncConfigDirect(t, userA, ts.URL, "u", "p")
	insertTestAttendance(t, userA, "2024-03-01")
	insertTestAttendance(t, userA, "2024-03-02")

	reqPush := createAuthenticatedRequest(t, "POST", "/api/sync/push", `{}`, userA)
	wPush := httptest.NewRecorder()
	handleSyncPush(wPush, reqPush)
	require.Equal(t, 200, wPush.Code)

	var pushResp SyncPushResponse
	json.NewDecoder(wPush.Body).Decode(&pushResp)

	// userB 用同一台 WebDAV pull
	userB := createTestUser(t, "userB", "pass")
	saveSyncConfigDirect(t, userB, ts.URL, "u", "p")

	// pull 前 userB 无数据
	var beforeCnt int
	db.QueryRow("SELECT COUNT(*) FROM attendance WHERE user_id = ?", userB).Scan(&beforeCnt)
	assert.Equal(t, 0, beforeCnt)

	reqPull := createAuthenticatedRequest(t, "POST", "/api/sync/pull", `{}`, userB)
	wPull := httptest.NewRecorder()
	handleSyncPull(wPull, reqPull)
	assert.Equal(t, 200, wPull.Code)

	// pull 后 userB 应有 2 条考勤（替换式导入）
	var afterCnt int
	db.QueryRow("SELECT COUNT(*) FROM attendance WHERE user_id = ?", userB).Scan(&afterCnt)
	assert.Equal(t, 2, afterCnt)

	// sync_state 应记录
	state, _ := getSyncState(userB)
	require.NotNil(t, state)
	assert.Equal(t, pushResp.LocalHash, state.LastRemoteHash)
	assert.Equal(t, "pull", state.Direction)
}

func TestHandleSyncPull_SameSnapshotMultipleTimes_NoduplicateData(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "u1", "pass")
	ts, _ := fakeWebDAV(t)
	saveSyncConfigDirect(t, userID, ts.URL, "u", "p")
	insertTestAttendance(t, userID, "2024-04-01")

	// push
	reqPush := createAuthenticatedRequest(t, "POST", "/api/sync/push", `{}`, userID)
	wPush := httptest.NewRecorder()
	handleSyncPush(wPush, reqPush)
	require.Equal(t, 200, wPush.Code)

	// 删除本地数据，force pull 两次
	db.Exec("DELETE FROM attendance WHERE user_id = ?", userID)
	db.Exec("DELETE FROM sync_state WHERE user_id = ?", userID)

	for i := 0; i < 2; i++ {
		req := createAuthenticatedRequest(t, "POST", "/api/sync/pull", `{"force":true}`, userID)
		w := httptest.NewRecorder()
		handleSyncPull(w, req)
		assert.Equal(t, 200, w.Code, "第 %d 次 pull 应成功", i+1)
	}

	var cnt int
	db.QueryRow("SELECT COUNT(*) FROM attendance WHERE user_id = ?", userID).Scan(&cnt)
	assert.Equal(t, 1, cnt, "pull 多次同一快照不应产生重复数据")
}

func TestHandleSyncPull_Conflict_Returns409(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "u1", "pass")
	ts, _ := fakeWebDAV(t)
	saveSyncConfigDirect(t, userID, ts.URL, "u", "p")
	insertTestAttendance(t, userID, "2024-05-01")

	// 先 push 建立状态
	req1 := createAuthenticatedRequest(t, "POST", "/api/sync/push", `{}`, userID)
	w1 := httptest.NewRecorder()
	handleSyncPush(w1, req1)
	require.Equal(t, 200, w1.Code)

	// 模拟本地和远端都变化
	insertTestAttendance(t, userID, "2024-05-02") // 本地新增

	// 修改远端 manifest hash，模拟远端也变化
	client := newWebDAVClient(&SyncConfig{
		WebDAVURL: ts.URL, WebDAVUsername: "u", WebDAVPassword: "p",
	})
	m, _ := client.getManifest()
	m.SnapshotHash = "changed-by-someone-else"
	client.putManifest(m)

	// 不带 force 的 pull 应返回 409
	req2 := createAuthenticatedRequest(t, "POST", "/api/sync/pull", `{}`, userID)
	w2 := httptest.NewRecorder()
	handleSyncPull(w2, req2)
	assert.Equal(t, 409, w2.Code)

	var conflict SyncConflictResponse
	require.NoError(t, json.NewDecoder(w2.Body).Decode(&conflict))
	assert.Contains(t, conflict.Error, "Conflict")
}

func TestHandleSyncPull_ForcePull_CreatesBackup(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "u1", "pass")
	ts, files := fakeWebDAV(t)
	saveSyncConfigDirect(t, userID, ts.URL, "u", "p")
	insertTestAttendance(t, userID, "2024-06-01")

	// push 建立初始快照
	req1 := createAuthenticatedRequest(t, "POST", "/api/sync/push", `{}`, userID)
	w1 := httptest.NewRecorder()
	handleSyncPush(w1, req1)
	require.Equal(t, 200, w1.Code)

	// 先清除 sync_state 以跳过冲突检测
	db.Exec("DELETE FROM sync_state WHERE user_id = ?", userID)

	// force pull
	req2 := createAuthenticatedRequest(t, "POST", "/api/sync/pull", `{"force":true}`, userID)
	w2 := httptest.NewRecorder()
	handleSyncPull(w2, req2)
	assert.Equal(t, 200, w2.Code)

	// WebDAV 上应有 backup-before-pull 文件
	hasBackup := false
	for key := range files {
		if strings.Contains(key, "backup-before-pull") {
			hasBackup = true
			break
		}
	}
	assert.True(t, hasBackup, "force pull 前应上传备份快照")
}

// --- POST /api/sync/check ---

func TestHandleSyncCheck_NoConfig(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := createTestUser(t, "u1", "pass")

	req := createAuthenticatedRequest(t, "POST", "/api/sync/check", "", userID)
	w := httptest.NewRecorder()
	handleSyncCheck(w, req)

	assert.Equal(t, 200, w.Code)
	var resp SyncCheckResponse
	require.NoError(t, json.NewDecoder(w.Body).Decode(&resp))
	assert.Equal(t, "no_config", resp.Status)
}

func TestHandleSyncCheck_FirstSync(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := createTestUser(t, "u1", "pass")
	ts, _ := fakeWebDAV(t)
	saveSyncConfigDirect(t, userID, ts.URL, "u", "p")

	req := createAuthenticatedRequest(t, "POST", "/api/sync/check", "", userID)
	w := httptest.NewRecorder()
	handleSyncCheck(w, req)

	var resp SyncCheckResponse
	require.NoError(t, json.NewDecoder(w.Body).Decode(&resp))
	assert.Equal(t, "first_sync", resp.Status)
}

func TestHandleSyncCheck_Conflict(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := createTestUser(t, "u1", "pass")
	ts, _ := fakeWebDAV(t)
	saveSyncConfigDirect(t, userID, ts.URL, "u", "p")
	insertTestAttendance(t, userID, "2024-07-01")

	// push 建立状态
	req1 := createAuthenticatedRequest(t, "POST", "/api/sync/push", `{}`, userID)
	w1 := httptest.NewRecorder()
	handleSyncPush(w1, req1)
	require.Equal(t, 200, w1.Code)

	// 模拟两端都变化
	insertTestAttendance(t, userID, "2024-07-02")
	client := newWebDAVClient(&SyncConfig{
		WebDAVURL: ts.URL, WebDAVUsername: "u", WebDAVPassword: "p",
	})
	m, _ := client.getManifest()
	m.SnapshotHash = "remote-changed"
	client.putManifest(m)

	req2 := createAuthenticatedRequest(t, "POST", "/api/sync/check", "", userID)
	w2 := httptest.NewRecorder()
	handleSyncCheck(w2, req2)

	var resp SyncCheckResponse
	require.NoError(t, json.NewDecoder(w2.Body).Decode(&resp))
	assert.Equal(t, "conflict", resp.Status)
}

// --- GET /api/sync/logs ---

func TestHandleSyncLogs_Empty(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := createTestUser(t, "u1", "pass")

	req := createAuthenticatedRequest(t, "GET", "/api/sync/logs", "", userID)
	w := httptest.NewRecorder()
	handleSyncLogs(w, req)

	assert.Equal(t, 200, w.Code)
	var resp SyncLogListResponse
	require.NoError(t, json.NewDecoder(w.Body).Decode(&resp))
	assert.Empty(t, resp.Logs)
}

func TestHandleSyncLogs_RecordsFailure(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := createTestUser(t, "u1", "pass")

	// 模拟一次失败 push（无配置）
	req := createAuthenticatedRequest(t, "POST", "/api/sync/push", `{}`, userID)
	w := httptest.NewRecorder()
	handleSyncPush(w, req)
	assert.Equal(t, 400, w.Code) // 无配置返回 400

	// 手动写一条失败日志
	writeSyncLog(userID, "push", "error", "no config found")

	req2 := createAuthenticatedRequest(t, "GET", "/api/sync/logs", "", userID)
	w2 := httptest.NewRecorder()
	handleSyncLogs(w2, req2)

	var resp SyncLogListResponse
	require.NoError(t, json.NewDecoder(w2.Body).Decode(&resp))
	require.Len(t, resp.Logs, 1)
	assert.Equal(t, "error", resp.Logs[0].Status)
	assert.Equal(t, "push", resp.Logs[0].Direction)
}

func TestHandleSyncLogs_AutoRecordsOnPushFail(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := createTestUser(t, "u1", "pass")

	// 配置一个不存在的 WebDAV URL（会触发网络错误并写日志）
	saveSyncConfigDirect(t, userID, "http://127.0.0.1:19999", "u", "p")
	insertTestAttendance(t, userID, "2024-08-01")

	req := createAuthenticatedRequest(t, "POST", "/api/sync/push", `{}`, userID)
	w := httptest.NewRecorder()
	handleSyncPush(w, req)
	assert.Equal(t, 502, w.Code)

	// 日志应已记录失败
	req2 := createAuthenticatedRequest(t, "GET", "/api/sync/logs", "", userID)
	w2 := httptest.NewRecorder()
	handleSyncLogs(w2, req2)
	var resp SyncLogListResponse
	require.NoError(t, json.NewDecoder(w2.Body).Decode(&resp))
	require.NotEmpty(t, resp.Logs)
	assert.Equal(t, "error", resp.Logs[0].Status)
	assert.Equal(t, "push", resp.Logs[0].Direction)
}

// --- 加密脱敏测试 ---

func TestSyncConfigPasswordNotLeakedInResponse(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := createTestUser(t, "u1", "pass")

	body := `{"webdav_url":"https://dav.test","webdav_username":"alice","webdav_password":"SuperSecretPwd!","remote_path":""}`
	req := createAuthenticatedRequest(t, "POST", "/api/sync/config", body, userID)
	w := httptest.NewRecorder()
	handleSyncConfigPost(w, req)
	assert.Equal(t, 200, w.Code)

	// POST 响应不含明文密码
	assert.NotContains(t, w.Body.String(), "SuperSecretPwd!")

	// GET 响应不含明文密码
	req2 := createAuthenticatedRequest(t, "GET", "/api/sync/config", "", userID)
	w2 := httptest.NewRecorder()
	handleSyncConfigGet(w2, req2)
	assert.NotContains(t, w2.Body.String(), "SuperSecretPwd!")
}
