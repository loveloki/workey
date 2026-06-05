package app

import (
	"sync"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"
)
var syncMu sync.Mutex

// WebDAV 手动同步 handler

// 加密配置时使用的 AAD标识
const aadWebDAVPassword = "webdav_password"

// getEncKey 获取用于配置加密的 AES key（基于 jwtSecret 派生，使用 PBKDF2 增强）
// 使用 userID 作为盐的一部分，确保不同用户的配置加密密钥不同（M1）
func getEncKey(userID int64) []byte {
	salt := []byte(fmt.Sprintf("workey-sync-config-%d", userID))
	return deriveKey(jwtSecret, salt)
}

// getSnapshotKey 获取用于快照加密的全局 AES key
// 不使用 userID 做盐，因为快照需要跨会话可解密（同一应用实例的同一用户）
func getSnapshotKey() []byte {
	return deriveKey(jwtSecret, []byte("workey-snapshot"))
}

// storeMasterKeyLocally 用 jwtSecret 加密主密钥后存入本地数据库
func storeMasterKeyLocally(userID int64, masterKey []byte) error {
	localKey := deriveKey(jwtSecret, []byte("workey-local-master-store"))
	nonceCiphertext, err := aesGCMEncrypt(localKey, masterKey, []byte("workey-local-key"))
	if err != nil {
		return err
	}
	encoded := hex.EncodeToString(nonceCiphertext)
	_, err = db.Exec(`INSERT INTO user_keys (user_id, master_key_enc) VALUES (?, ?)
		ON CONFLICT(user_id) DO UPDATE SET master_key_enc = ?, updated_at = CURRENT_TIMESTAMP`,
		userID, encoded, encoded)
	return err
}

// loadMasterKeyLocally 从本地数据库加载并解密主密钥
func loadMasterKeyLocally(userID int64) ([]byte, error) {
	var encoded string
	err := db.QueryRow(`SELECT master_key_enc FROM user_keys WHERE user_id = ?`, userID).Scan(&encoded)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	data, err := hex.DecodeString(encoded)
	if err != nil {
		return nil, err
	}
	localKey := deriveKey(jwtSecret, []byte("workey-local-master-store"))
	return aesGCMDecrypt(localKey, data, []byte("workey-local-key"))
}

// getEffectiveEncKey 获取用于快照加密的密钥
// 优先使用用户的主密钥（可跨服务器迁移），否则回退到全局 jwtSecret 派生
func getEffectiveEncKey(userID int64) ([]byte, error) {
	masterKey, err := loadMasterKeyLocally(userID)
	if err == nil && masterKey != nil {
		return masterKey, nil
	}
	return getSnapshotKey(), nil
}

// initSyncDB 创建同步相关数据表
func initSyncDB() {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS sync_config (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
			webdav_url TEXT NOT NULL,
			webdav_username TEXT NOT NULL,
			webdav_password_enc TEXT NOT NULL,
			remote_path TEXT NOT NULL DEFAULT '',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS sync_state (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
			last_local_hash TEXT NOT NULL DEFAULT '',
			last_remote_hash TEXT NOT NULL DEFAULT '',
			last_sync_at DATETIME NOT NULL,
			direction TEXT NOT NULL DEFAULT ''
		)`,
		`CREATE TABLE IF NOT EXISTS sync_log (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL REFERENCES users(id),
			direction TEXT NOT NULL,
			status TEXT NOT NULL,
			message TEXT NOT NULL DEFAULT '',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
	}
	for _, q := range queries {
		if _, err := db.Exec(q); err != nil {
			log.Printf("Warning: failed to create sync table: %v", err)
		}
	}
}

// --- 辅助函数 ---

// getSyncConfig 获取用户的 WebDAV 配置（包含解密密码）
func getSyncConfig(userID int64) (*SyncConfig, error) {
	var cfg SyncConfig
	var passEnc string
	err := db.QueryRow(
		"SELECT id, user_id, webdav_url, webdav_username, webdav_password_enc, remote_path, created_at, updated_at FROM sync_config WHERE user_id = ?",
		userID,
	).Scan(&cfg.ID, &cfg.UserID, &cfg.WebDAVURL, &cfg.WebDAVUsername, &passEnc, &cfg.RemotePath, &cfg.CreatedAt, &cfg.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	key := getEncKey(userID)
	pass, err := decryptField(key, passEnc, aadWebDAVPassword)
	if err != nil {
		return nil, fmt.Errorf("decrypt webdav password: %w", err)
	}
	cfg.WebDAVPassword = pass
	return &cfg, nil
}

// getSyncState 获取用户的同步状态
func getSyncState(userID int64) (*SyncState, error) {
	var s SyncState
	err := db.QueryRow(
		"SELECT id, user_id, last_local_hash, last_remote_hash, last_sync_at, direction FROM sync_state WHERE user_id = ?",
		userID,
	).Scan(&s.ID, &s.UserID, &s.LastLocalHash, &s.LastRemoteHash, &s.LastSyncAt, &s.Direction)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &s, nil
}

// upsertSyncState 更新或创建同步状态
func upsertSyncState(userID int64, localHash, remoteHash, direction string) error {
	now := nowDatetime()
	_, err := db.Exec(
		`INSERT INTO sync_state (user_id, last_local_hash, last_remote_hash, last_sync_at, direction)
		 VALUES (?, ?, ?, ?, ?)
		 ON CONFLICT(user_id) DO UPDATE SET
			last_local_hash = excluded.last_local_hash,
			last_remote_hash = excluded.last_remote_hash,
			last_sync_at = excluded.last_sync_at,
			direction = excluded.direction`,
		userID, localHash, remoteHash, now, direction,
	)
	return err
}

// writeSyncLog 记录同步日志
func writeSyncLog(userID int64, direction, status, message string) {
	db.Exec(
		"INSERT INTO sync_log (user_id, direction, status, message) VALUES (?, ?, ?, ?)",
		userID, direction, status, message,
	)
	// 定期清理，只保留最近 1000 条日志
	const maxSyncLogs = 1000
	db.Exec("DELETE FROM sync_log WHERE id NOT IN (SELECT id FROM sync_log ORDER BY id DESC LIMIT ?)", maxSyncLogs)
}

// --- Handlers ---

// handleSyncConfig GET /api/sync/config
func handleSyncConfigGet(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	cfg, err := getSyncConfig(userID)
	if err != nil {
		jsonError(w, "Failed to load sync config", http.StatusInternalServerError)
		return
	}
	if cfg == nil {
		jsonOK(w, SyncConfigResponse{Configured: false})
		return
	}
	jsonOK(w, SyncConfigResponse{
		Configured:     true,
		WebDAVURL:      cfg.WebDAVURL,
		WebDAVUsername: cfg.WebDAVUsername,
		RemotePath:     cfg.RemotePath,
		CreatedAt:      cfg.CreatedAt,
		UpdatedAt:      cfg.UpdatedAt,
	})
}

// handleSyncConfigPost POST /api/sync/config
func handleSyncConfigPost(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)

	var req struct {
		WebDAVURL      string `json:"webdav_url"`
		WebDAVUsername string `json:"webdav_username"`
		WebDAVPassword string `json:"webdav_password"`
		RemotePath     string `json:"remote_path"`
		LoginPassword  string `json:"login_password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(req.WebDAVURL) == "" || strings.TrimSpace(req.WebDAVUsername) == "" || strings.TrimSpace(req.WebDAVPassword) == "" {
		jsonError(w, "webdav_url, webdav_username and webdav_password are required", http.StatusBadRequest)
		return
	}
	if req.RemotePath != "" && !strings.HasPrefix(req.RemotePath, "/") {
		jsonError(w, "remote_path must start with /", http.StatusBadRequest)
		return
	}

	key := getEncKey(userID)
	passEnc, err := encryptField(key, req.WebDAVPassword, aadWebDAVPassword)
	if err != nil {
		jsonError(w, "Failed to encrypt password", http.StatusInternalServerError)
		return
	}

	now := nowDatetime()
	_, err = db.Exec(
		`INSERT INTO sync_config (user_id, webdav_url, webdav_username, webdav_password_enc, remote_path, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT(user_id) DO UPDATE SET
			webdav_url = excluded.webdav_url,
			webdav_username = excluded.webdav_username,
			webdav_password_enc = excluded.webdav_password_enc,
			remote_path = excluded.remote_path,
			updated_at = excluded.updated_at`,
		userID, req.WebDAVURL, req.WebDAVUsername, passEnc, req.RemotePath, now, now,
	)
	if err != nil {
		jsonError(w, "Failed to save sync config", http.StatusInternalServerError)
		return
	}


	// 如果有登录密码，生成主密钥并存储
	var warning string
	if req.LoginPassword != "" {
		var passwordHash string
		phErr := db.QueryRow("SELECT password_hash FROM users WHERE id = ?", userID).Scan(&passwordHash)
		if phErr == nil && checkPassword(req.LoginPassword, passwordHash) {
			if mk, kgErr := generateMasterKey(); kgErr == nil {
				// 本地存储
				if storeErr := storeMasterKeyLocally(userID, mk); storeErr == nil {
					// 上传加密主密钥到 WebDAV
					salt, encrypted, wrapErr := wrapMasterKeyWithPassword(mk, req.LoginPassword)
					if wrapErr == nil {
						emk := &EncryptedMasterKey{
							SaltHex:      hex.EncodeToString(salt),
							EncryptedHex: hex.EncodeToString(encrypted),
						}
						tmpClient := newWebDAVClient(&SyncConfig{
							WebDAVURL:      req.WebDAVURL,
							WebDAVUsername: req.WebDAVUsername,
							WebDAVPassword: req.WebDAVPassword,
							RemotePath:     req.RemotePath,
						})
						tmpClient.putEncryptedMasterKey(emk)
					}
				}
			}
		} else {
			warning = "登录密码验证失败，无法设置主密钥加密。如需跨设备同步，请使用正确的密码重新保存配置。"
		}
	}
	jsonOK(w, SyncConfigResponse{
		Configured:     true,
		WebDAVURL:      req.WebDAVURL,
		WebDAVUsername: req.WebDAVUsername,
		RemotePath:     req.RemotePath,
		Warning:        warning,
	})
}

// handleSyncConfigDelete DELETE /api/sync/config
func handleSyncConfigDelete(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	if _, err := db.Exec("DELETE FROM sync_config WHERE user_id = ?", userID); err != nil {
		jsonError(w, "Failed to delete sync config", http.StatusInternalServerError)
		return
	}
	db.Exec("DELETE FROM sync_state WHERE user_id = ?", userID)
	db.Exec("DELETE FROM sync_log WHERE user_id = ?", userID)
	jsonOK(w, MessageResponse{Message: "Sync config deleted"})
}

// handleSyncValidate POST /api/sync/validate
func handleSyncValidate(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	userID := getUserID(r)

	// 优先使用请求体中的配置（允许不保存测试连接）
	var inlineCfg struct {
		WebDAVURL      string `json:"webdav_url"`
		WebDAVUsername string `json:"webdav_username"`
		WebDAVPassword string `json:"webdav_password"`
		RemotePath     string `json:"remote_path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&inlineCfg); err == nil && inlineCfg.WebDAVURL != "" {
		cfg := &SyncConfig{
			WebDAVURL:      inlineCfg.WebDAVURL,
			WebDAVUsername: inlineCfg.WebDAVUsername,
			WebDAVPassword: inlineCfg.WebDAVPassword,
			RemotePath:     inlineCfg.RemotePath,
		}
		client := newWebDAVClient(cfg)
		if err := client.validateConnection(); err != nil {
			jsonOK(w, SyncValidateResponse{Success: false, Message: err.Error()})
			return
		}
		jsonOK(w, SyncValidateResponse{Success: true, Message: "Connection successful"})
		return
	}

	cfg, err := getSyncConfig(userID)
	if err != nil || cfg == nil {
		jsonError(w, "Sync config not found", http.StatusBadRequest)
		return
	}
	client := newWebDAVClient(cfg)
	cfg.WebDAVPassword = "" // 使用后立即清零
	if err := client.validateConnection(); err != nil {
		jsonOK(w, SyncValidateResponse{Success: false, Message: err.Error()})
		return
	}
	jsonOK(w, SyncValidateResponse{Success: true, Message: "Connection successful"})
}

// handleSyncStatus GET /api/sync/status
func handleSyncStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	userID := getUserID(r)
	cfg, err := getSyncConfig(userID)
	if err != nil {
		jsonError(w, "Failed to load config", http.StatusInternalServerError)
		return
	}
	if cfg == nil {
		jsonOK(w, SyncStatusResponse{Configured: false})
		return
	}
	state, _ := getSyncState(userID)
	resp := SyncStatusResponse{Configured: true}
	if state != nil {
		resp.LastSyncAt = &state.LastSyncAt
		resp.LastDirection = &state.Direction
		resp.LastLocalHash = &state.LastLocalHash
		resp.LastRemoteHash = &state.LastRemoteHash
	}
	jsonOK(w, resp)
}

// handleSyncCheck POST /api/sync/check
func handleSyncCheck(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	userID := getUserID(r)

	cfg, err := getSyncConfig(userID)
	if err != nil {
		jsonError(w, "Failed to load config", http.StatusInternalServerError)
		return
	}
	if cfg == nil {
		jsonOK(w, SyncCheckResponse{Status: "no_config", Message: "Sync not configured"})
		return
	}

	// 使用只读事务确保多个查询的一致性（m1）
	tx, err := db.Begin()
	if err != nil {
		jsonError(w, "Database error", http.StatusInternalServerError)
		return
	}
	data, err := buildExportData(r.Context(), tx, userID)
	if err != nil {
		tx.Rollback()
		jsonError(w, "Failed to read local data", http.StatusInternalServerError)
		return
	}
	tx.Rollback() // 只读事务，查询完即可回滚
	localHash, err := computeDataHash(data)
	if err != nil {
		jsonError(w, "Failed to compute local hash", http.StatusInternalServerError)
		return
	}

	client := newWebDAVClient(cfg)
	cfg.WebDAVPassword = "" // 使用后立即清零
	manifest, err := client.getManifest()
	if err != nil {
		writeSyncLog(userID, "check", "error", "Failed to get remote manifest: "+err.Error())
		jsonError(w, "Failed to reach remote: "+err.Error(), http.StatusBadGateway)
		return
	}

	remoteHash := ""
	if manifest != nil {
		remoteHash = manifest.SnapshotHash
	}

	state, _ := getSyncState(userID)
	result := detectConflict(localHash, remoteHash, state)

	var status, message string
	switch {
	case state == nil && manifest == nil:
		status = "first_sync"
		message = "No previous sync. Ready for first push."
	case result.HasConflict:
		status = "conflict"
		message = "Both local and remote have changed since last sync. Please choose push or pull."
	case result.RemoteChanged && !result.LocalChanged:
		status = "remote_ahead"
		message = "Remote has new data. Ready to pull."
	case result.LocalChanged && !result.RemoteChanged:
		status = "local_ahead"
		message = "Local has new data. Ready to push."
	default:
		status = "ok"
		message = "Local and remote are in sync."
	}

	var lastLocal, lastRemote string
	if state != nil {
		lastLocal = state.LastLocalHash
		lastRemote = state.LastRemoteHash
	}

	jsonOK(w, SyncCheckResponse{
		Status:            status,
		CurrentLocalHash:  localHash,
		CurrentRemoteHash: remoteHash,
		LastLocalHash:     lastLocal,
		LastRemoteHash:    lastRemote,
		Message:           message,
	})
}

// handleSyncPush POST /api/sync/push
func handleSyncPush(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	syncMu.Lock()
	defer syncMu.Unlock()
	userID := getUserID(r)

	var req struct {
		Force bool `json:"force"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	cfg, err := getSyncConfig(userID)
	if err != nil || cfg == nil {
		jsonError(w, "Sync not configured", http.StatusBadRequest)
		return
	}

	encKey, _ := getEffectiveEncKey(userID)
	// 使用事务确保快照数据一致性（m1）
	tx, err := db.Begin()
	if err != nil {
		writeSyncLog(userID, "push", "error", "Failed to begin transaction")
		jsonError(w, "Database error", http.StatusInternalServerError)
		return
	}
	data, err := buildExportData(r.Context(), tx, userID)
	if err != nil {
		tx.Rollback()
		writeSyncLog(userID, "push", "error", "Failed to read local data: "+err.Error())
		jsonError(w, "Failed to read local data", http.StatusInternalServerError)
		return
	}
	tx.Rollback() // 只读事务，数据已读取完毕
	localHash, err := computeDataHash(data)
	if err != nil {
		writeSyncLog(userID, "push", "error", "Failed to compute local hash")
		jsonError(w, "Failed to compute local hash", http.StatusInternalServerError)
		return
	}

	client := newWebDAVClient(cfg)
	cfg.WebDAVPassword = "" // 使用后立即清零
	manifest, err := client.getManifest()
	if err != nil {
		writeSyncLog(userID, "push", "error", "Failed to get remote manifest: "+err.Error())
		jsonError(w, "Failed to reach remote: "+err.Error(), http.StatusBadGateway)
		return
	}

	remoteHash := ""
	if manifest != nil {
		remoteHash = manifest.SnapshotHash
	}

	// 冲突检测
	if !req.Force {
		state, _ := getSyncState(userID)
		result := detectConflict(localHash, remoteHash, state)
		if result.HasConflict {
			writeSyncLog(userID, "push", "conflict", "Both local and remote changed")
			var lastLocal, lastRemote string
			if state != nil {
				lastLocal = state.LastLocalHash
				lastRemote = state.LastRemoteHash
			}
			jsonStatus(w, http.StatusConflict, SyncConflictResponse{
				Error:             "Conflict: both local and remote have changed. Use force=true to overwrite remote.",
				CurrentLocalHash:  localHash,
				CurrentRemoteHash: remoteHash,
				LastLocalHash:     lastLocal,
				LastRemoteHash:    lastRemote,
			})
			return
		}
	}

	// force push 前创建本地备份（与 force pull 对称）
	if req.Force {
		backupTx, err := db.Begin()
		if err != nil {
			writeSyncLog(userID, "push", "error", "Failed to begin backup transaction")
			jsonError(w, "Database error", http.StatusInternalServerError)
			return
		}
		backupData, backupHash, backupFileName, err := buildLocalBackupSnapshot(r.Context(), backupTx, userID, encKey)
		if err != nil {
			backupTx.Rollback()
			writeSyncLog(userID, "push", "error", "Failed to build backup: "+err.Error())
			jsonError(w, "Failed to build backup before push: "+err.Error(), http.StatusInternalServerError)
			return
		}
		backupTx.Rollback() // 只读事务
		if err := client.putFile(backupFileName, backupData); err != nil {
			writeSyncLog(userID, "push", "error", "Failed to upload backup: "+err.Error())
			jsonError(w, "Failed to upload backup before push: "+err.Error(), http.StatusBadGateway)
			return
		}
		log.Printf("force push: backup uploaded as %s (hash=%s)", backupFileName, backupHash)
	}

	// 构建加密快照
	encrypted, hash, err := buildEncryptedSnapshot(r.Context(), data, encKey)
	if err != nil {
		writeSyncLog(userID, "push", "error", "Failed to build snapshot: "+err.Error())
		jsonError(w, "Failed to build snapshot", http.StatusInternalServerError)
		return
	}

	fileName := snapshotFileName()

	// 上传快照
	if err := client.putFile(fileName, encrypted); err != nil {
		writeSyncLog(userID, "push", "error", "Failed to upload snapshot: "+err.Error())
		jsonError(w, "Failed to upload snapshot: "+err.Error(), http.StatusBadGateway)
		return
	}

	// 更新 manifest
	newManifest := &SyncManifest{
		Version:      1,
		SnapshotFile: fileName,
		SnapshotHash: hash,
		PushedAt:     time.Now().UTC().Format(time.RFC3339),
	}
	if err := client.putManifest(newManifest); err != nil {
		// manifest 更新失败，清理已上传的孤立快照文件
		if delErr := client.deleteFile(fileName); delErr != nil {
			log.Printf("WARNING: failed to cleanup orphan snapshot %s: %v", fileName, delErr)
		}
		writeSyncLog(userID, "push", "error", "Snapshot uploaded but manifest update failed: "+err.Error())
		jsonError(w, "Snapshot uploaded but manifest update failed: "+err.Error(), http.StatusBadGateway)
		return
	}

	// 全部成功后才更新本地状态
	if err := upsertSyncState(userID, hash, hash, "push"); err != nil {
		writeSyncLog(userID, "push", "error", "Failed to save sync state: "+err.Error())
		// 这里 push 已成功，不影响远端数据
	}

	writeSyncLog(userID, "push", "success", fmt.Sprintf("Pushed %s", fileName))
	jsonOK(w, SyncOperationResponse{
		Message:    "Push successful",
		LocalHash:  hash,
		RemoteHash: hash,
	})
}

// handleSyncPull POST /api/sync/pull
func handleSyncPull(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	syncMu.Lock()
	defer syncMu.Unlock()
	userID := getUserID(r)
	ctx := r.Context()

	var req struct {
		Force         bool   `json:"force"`
		LoginPassword string `json:"login_password"` // 用于迁移时恢复主密钥
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	cfg, err := getSyncConfig(userID)
	if err != nil || cfg == nil {
		jsonError(w, "Sync not configured", http.StatusBadRequest)
		return
	}

	encKey, _ := getEffectiveEncKey(userID)

	client := newWebDAVClient(cfg)
	cfg.WebDAVPassword = "" // 使用后立即清零

	// ★ 如果没有本地主密钥，但提供了密码，尝试从 WebDAV 恢复
	if req.LoginPassword != "" {
		existingKey, _ := loadMasterKeyLocally(userID)
		if existingKey == nil {
			if emk, dlErr := client.getEncryptedMasterKey(); dlErr == nil {
				salt, sErr := hex.DecodeString(emk.SaltHex)
				encrypted, eErr := hex.DecodeString(emk.EncryptedHex)
				if sErr == nil && eErr == nil {
					if masterKey, unwrapErr := unwrapMasterKeyWithPassword(salt, encrypted, req.LoginPassword); unwrapErr == nil {
						storeMasterKeyLocally(userID, masterKey)
						encKey, _ = getEffectiveEncKey(userID)
					}
				}
			}
		}
	}

	manifest, err := client.getManifest()
	if err != nil {
		writeSyncLog(userID, "pull", "error", "Failed to get remote manifest: "+err.Error())
		jsonError(w, "Failed to reach remote: "+err.Error(), http.StatusBadGateway)
		return
	}
	if manifest == nil {
		jsonError(w, "No remote data found. Please push first.", http.StatusBadRequest)
		return
	}

	remoteHash := manifest.SnapshotHash

	// 使用事务计算本地 hash，确保一致性（m1）
	txLocal, err := db.Begin()
	if err != nil {
		writeSyncLog(userID, "pull", "error", "Failed to begin transaction")
		jsonError(w, "Database error", http.StatusInternalServerError)
		return
	}
	localData, err := buildExportData(ctx, txLocal, userID)
	if err != nil {
		txLocal.Rollback()
		writeSyncLog(userID, "pull", "error", "Failed to read local data")
		jsonError(w, "Failed to read local data", http.StatusInternalServerError)
		return
	}
	txLocal.Rollback() // 只读事务
	localHash, err := computeDataHash(localData)
	if err != nil {
		writeSyncLog(userID, "pull", "error", "Failed to compute local hash")
		jsonError(w, "Failed to compute local hash", http.StatusInternalServerError)
		return
	}

	// 冲突检测
	if !req.Force {
		state, _ := getSyncState(userID)
		result := detectConflict(localHash, remoteHash, state)
		if result.HasConflict {
			writeSyncLog(userID, "pull", "conflict", "Both local and remote changed")
			var lastLocal, lastRemote string
			if state != nil {
				lastLocal = state.LastLocalHash
				lastRemote = state.LastRemoteHash
			}
			jsonStatus(w, http.StatusConflict, SyncConflictResponse{
				Error:             "Conflict: both local and remote have changed. Use force=true to overwrite local data.",
				CurrentLocalHash:  localHash,
				CurrentRemoteHash: remoteHash,
				LastLocalHash:     lastLocal,
				LastRemoteHash:    lastRemote,
			})
			return
		}
	}

	// force pull 前建立本地备份
	if req.Force {
		backupTx, err := db.Begin()
		if err != nil {
			writeSyncLog(userID, "pull", "error", "Failed to begin backup transaction")
			jsonError(w, "Database error", http.StatusInternalServerError)
			return
		}
		backupData, backupHash, backupFileName, err := buildLocalBackupSnapshot(ctx, backupTx, userID, encKey)
		if err != nil {
			backupTx.Rollback()
			writeSyncLog(userID, "pull", "error", "Failed to build backup: "+err.Error())
			jsonError(w, "Failed to build backup before pull: "+err.Error(), http.StatusInternalServerError)
			return
		}
		backupTx.Rollback() // 只读事务
		if err := client.putFile(backupFileName, backupData); err != nil {
			writeSyncLog(userID, "pull", "error", "Failed to upload backup: "+err.Error())
			jsonError(w, "Failed to upload backup before pull: "+err.Error(), http.StatusBadGateway)
			return
		}
		log.Printf("force pull: backup uploaded as %s (hash=%s)", backupFileName, backupHash)
	}

	// 下载快照
	encrypted, err := client.getFile(manifest.SnapshotFile)
	if err != nil || encrypted == nil {
		msg := "Failed to download snapshot"
		if err != nil {
			msg += ": " + err.Error()
		}
		writeSyncLog(userID, "pull", "error", msg)
		jsonError(w, msg, http.StatusBadGateway)
		return
	}

	remoteData, err := decryptSnapshot(ctx, encrypted, encKey)
	if err != nil {
		writeSyncLog(userID, "pull", "error", "Failed to decrypt snapshot: "+err.Error())
		jsonError(w, "Failed to decrypt snapshot: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// 校验远端数据 hash
	verifyHash, err := computeDataHash(remoteData)
	if err != nil {
		writeSyncLog(userID, "pull", "error", "Failed to verify remote hash")
		jsonError(w, "Failed to verify remote hash", http.StatusInternalServerError)
		return
	}
	if verifyHash != remoteHash {
		writeSyncLog(userID, "pull", "error", fmt.Sprintf("Hash mismatch: expected %s got %s", remoteHash, verifyHash))
		jsonError(w, "Remote snapshot hash mismatch, data may be corrupted", http.StatusInternalServerError)
		return
	}

	// 事务内替换式导入
	tx, err := db.Begin()
	if err != nil {
		writeSyncLog(userID, "pull", "error", "Failed to begin transaction")
		jsonError(w, "Database error", http.StatusInternalServerError)
		return
	}

	if err := replaceImportData(ctx, tx, userID, remoteData); err != nil {
		tx.Rollback()
		writeSyncLog(userID, "pull", "error", "Import failed, rolled back: "+err.Error())
		jsonError(w, "Import failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	if err := tx.Commit(); err != nil {
		tx.Rollback()
		writeSyncLog(userID, "pull", "error", "Commit failed: "+err.Error())
		jsonError(w, "Commit failed", http.StatusInternalServerError)
		return
	}

	// 导入成功后校验 hash 一致性
	txVerify, err := db.Begin()
	if err == nil {
		importedData, err := buildExportData(ctx, txVerify, userID)
		if err == nil {
			txVerify.Rollback()
			importedHash, err2 := computeDataHash(importedData)
			if err2 == nil && importedHash != remoteHash {
				log.Printf("WARNING: post-import hash mismatch: local=%s remote=%s", importedHash, remoteHash)
			}
		} else {
			txVerify.Rollback()
		}
	}

	// 更新同步状态
	if err := upsertSyncState(userID, remoteHash, remoteHash, "pull"); err != nil {
		writeSyncLog(userID, "pull", "error", "Failed to save sync state: "+err.Error())
	}

	writeSyncLog(userID, "pull", "success", fmt.Sprintf("Pulled %s", manifest.SnapshotFile))
	jsonOK(w, SyncOperationResponse{
		Message:    "Pull successful",
		LocalHash:  remoteHash,
		RemoteHash: remoteHash,
	})
}

// handleSyncLogs GET /api/sync/logs
func handleSyncLogs(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	userID := getUserID(r)

	rows, err := db.Query(
		"SELECT id, user_id, direction, status, message, created_at FROM sync_log WHERE user_id = ? ORDER BY id DESC LIMIT 100",
		userID,
	)
	if err != nil {
		log.Printf("ERROR: failed to query sync logs: %v", err)
		jsonError(w, "Failed to load logs", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	logs := []SyncLog{}
	for rows.Next() {
		var l SyncLog
		if err := rows.Scan(&l.ID, &l.UserID, &l.Direction, &l.Status, &l.Message, &l.CreatedAt); err != nil {
			continue
		}
		logs = append(logs, l)
	}
	jsonOK(w, SyncLogListResponse{Logs: logs})
}

// syncRoutes 注册同步相关路由
func syncRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/sync/config", corsMiddleware(authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case "GET":
			handleSyncConfigGet(w, r)
		case "POST":
			handleSyncConfigPost(w, r)
		case "DELETE":
			handleSyncConfigDelete(w, r)
		default:
			jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})))
	mux.HandleFunc("/api/sync/validate", corsMiddleware(authMiddleware(handleSyncValidate)))
	mux.HandleFunc("/api/sync/status", corsMiddleware(authMiddleware(handleSyncStatus)))
	mux.HandleFunc("/api/sync/check", corsMiddleware(authMiddleware(handleSyncCheck)))
	mux.HandleFunc("/api/sync/push", corsMiddleware(authMiddleware(handleSyncPush)))
	mux.HandleFunc("/api/sync/pull", corsMiddleware(authMiddleware(handleSyncPull)))
	mux.HandleFunc("/api/sync/logs", corsMiddleware(authMiddleware(handleSyncLogs)))
}
