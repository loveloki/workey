package app

import (
	"log"
	"time"
)

// syncManagerCheckInterval 后台管理器轮询间隔（每分钟检查一次所有用户）
const syncManagerCheckInterval = 1 * time.Minute

// SyncManager 后台定时同步管理器
// 每分钟轮询所有开启了自动同步的用户，检查是否需要执行 push
type SyncManager struct {
	stopCh chan struct{}
}

// NewSyncManager 创建后台同步管理器
func NewSyncManager() *SyncManager {
	return &SyncManager{
		stopCh: make(chan struct{}),
	}
}

// Start 启动后台轮询 goroutine
func (sm *SyncManager) Start() {
	go sm.loop()
	log.Println("[sync] Auto-sync manager started (check interval: 1m)")
}

// Stop 停止后台 goroutine
func (sm *SyncManager) Stop() {
	close(sm.stopCh)
}

// loop 是后台轮询主循环
func (sm *SyncManager) loop() {
	ticker := time.NewTicker(syncManagerCheckInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			sm.checkAndSync()
		case <-sm.stopCh:
			return
		}
	}
}

// checkAndSync 检查所有用户并执行定时同步
func (sm *SyncManager) checkAndSync() {
	users, err := getAutoSyncUsers()
	if err != nil {
		log.Printf("[sync] Failed to query auto-sync users: %v", err)
		return
	}
	if len(users) == 0 {
		return
	}

	now := time.Now()
	for _, u := range users {
		cfg := u.SyncConfig

		// 获取上次同步状态
		state, err := getSyncState(u.UserID)
		if err != nil {
			log.Printf("[sync] user %d: failed to get sync state: %v", u.UserID, err)
			continue
		}

		// 计算距上次同步的分钟数
		var minutesSinceLastSync int
		if state != nil && state.LastSyncAt != "" {
			lastSyncTime, err := time.Parse("2006-01-02 15:04:05", state.LastSyncAt)
			if err != nil {
				// 尝试 RFC3339 格式
				lastSyncTime, err = time.Parse(time.RFC3339, state.LastSyncAt)
				if err != nil {
					log.Printf("[sync] user %d: failed to parse last_sync_at %q: %v", u.UserID, state.LastSyncAt, err)
					minutesSinceLastSync = cfg.AutoSyncIntervalMinutes + 1 // 触发同步
				} else {
					minutesSinceLastSync = int(now.Sub(lastSyncTime).Minutes())
				}
			} else {
				minutesSinceLastSync = int(now.Sub(lastSyncTime).Minutes())
			}
		} else {
			// 从未同步过，立即触发首次自动同步
			minutesSinceLastSync = cfg.AutoSyncIntervalMinutes + 1
		}

		if minutesSinceLastSync < cfg.AutoSyncIntervalMinutes {
			continue // 还没到同步间隔
		}

		// 执行自动 push
		sm.autoPush(u.UserID, &cfg)
	}
}

// autoPush 执行自动推送（遇到冲突时跳过，不强推）
func (sm *SyncManager) autoPush(userID int64, cfg *SyncConfig) {
	unlock := lockUserSync(userID)
	defer unlock()

	// 使用只读事务读取本地数据
	tx, err := db.Begin()
	if err != nil {
		writeSyncLog(userID, "auto-push", "error", "Failed to begin transaction: "+err.Error())
		return
	}

	data, err := buildExportData(nil, tx, userID)
	if err != nil {
		tx.Rollback()
		writeSyncLog(userID, "auto-push", "error", "Failed to read local data: "+err.Error())
		return
	}
	tx.Rollback()

	localHash, err := computeDataHash(data)
	if err != nil {
		writeSyncLog(userID, "auto-push", "error", "Failed to compute local hash: "+err.Error())
		return
	}

	client := newWebDAVClient(cfg)
	cfg.WebDAVPassword = "" // 使用后立即清零

	manifest, err := client.getManifest()
	if err != nil {
		writeSyncLog(userID, "auto-push", "error", "Failed to get remote manifest: "+err.Error())
		return
	}

	remoteHash := ""
	if manifest != nil {
		remoteHash = manifest.SnapshotHash
	}

	// 冲突检测：如果两端都变化，跳过自动同步
	state, _ := getSyncState(userID)
	result := detectConflict(localHash, remoteHash, state)
	if result.HasConflict {
		writeSyncLog(userID, "auto-push", "conflict", "Both local and remote changed, skipping auto-sync")
		return
	}

	// 如果本地没有新数据，也跳过
	if !result.LocalChanged {
		return
	}

	// 构建加密快照
	encKey, _ := getEffectiveEncKey(userID)
	encrypted, hash, err := buildEncryptedSnapshot(nil, data, encKey)
	if err != nil {
		writeSyncLog(userID, "auto-push", "error", "Failed to build snapshot: "+err.Error())
		return
	}

	fileName := snapshotFileName()

	if err := client.putFile(fileName, encrypted); err != nil {
		writeSyncLog(userID, "auto-push", "error", "Failed to upload snapshot: "+err.Error())
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
		client.deleteFile(fileName) // 清理孤立快照
		writeSyncLog(userID, "auto-push", "error", "Snapshot uploaded but manifest update failed: "+err.Error())
		return
	}

	// 更新同步状态
	if err := upsertSyncState(userID, hash, hash, "auto-push"); err != nil {
		writeSyncLog(userID, "auto-push", "error", "Failed to save sync state: "+err.Error())
	}

	writeSyncLog(userID, "auto-push", "success", "Auto-sync push completed")
	log.Printf("[sync] user %d: auto-push completed (hash=%s)", userID, hash)
}
