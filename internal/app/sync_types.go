package app

// WebDAV 同步相关的内部类型定义

// SyncConfig 存储 WebDAV 连接配置（敏感字段加密后入库）
type SyncConfig struct {
	ID             int64  `json:"id"`
	UserID         int64  `json:"user_id"`
	WebDAVURL      string `json:"webdav_url"`
	WebDAVUsername string `json:"webdav_username"`
	// WebDAVPassword 加密存储，永不明文返回前端
	WebDAVPassword string `json:"-"`
	RemotePath     string `json:"remote_path"`
	CreatedAt      string `json:"created_at"`
	UpdatedAt      string `json:"updated_at"`
}

// SyncState 记录每次成功同步后的状态快照
type SyncState struct {
	ID             int64  `json:"id"`
	UserID         int64  `json:"user_id"`
	LastLocalHash  string `json:"last_local_hash"`
	LastRemoteHash string `json:"last_remote_hash"`
	LastSyncAt     string `json:"last_sync_at"`
	Direction      string `json:"direction"` // push / pull
}

// SyncLog 记录每次同步操作的详细日志
type SyncLog struct {
	ID        int64  `json:"id"`
	UserID    int64  `json:"user_id"`
	Direction string `json:"direction"` // push / pull / check
	Status    string `json:"status"`    // success / conflict / error
	Message   string `json:"message"`
	CreatedAt string `json:"created_at"`
}

// WebDAV 远端 manifest 文件结构
type SyncManifest struct {
	Version      int    `json:"version"`
	SnapshotFile string `json:"snapshot_file"`
	SnapshotHash string `json:"snapshot_hash"`
	PushedAt     string `json:"pushed_at"`
}

// EncryptedMasterKey 存储在 WebDAV 上的加密主密钥
type EncryptedMasterKey struct {
	SaltHex       string `json:"salt"`
	EncryptedHex  string `json:"encrypted"`
}
