package app

// 冲突检测逻辑
//
// 冲突判定规则：
// - 就计算当前本地 hash 和当前远端 hash
// - 与上次同步成功时记录的 last_local_hash / last_remote_hash 对比
// - 只有一方变化：可安全进行 push 或 pull
// - 两方都变化：返回 409 Conflict，需用户选择（force=true 时强制执行）

// ConflictResult 冲突检测结果
type ConflictResult struct {
	// HasConflict 为 true 表示本地和远端都有变化
	HasConflict bool
	// LocalChanged 本地有变化
	LocalChanged bool
	// RemoteChanged 远端有变化
	RemoteChanged bool
	CurrentLocalHash  string
	CurrentRemoteHash string
	LastLocalHash     string
	LastRemoteHash    string
}

// detectConflict 比较当前 hash 与上次同步记录的 hash
func detectConflict(currentLocalHash, currentRemoteHash string, state *SyncState) ConflictResult {
	result := ConflictResult{
		CurrentLocalHash:  currentLocalHash,
		CurrentRemoteHash: currentRemoteHash,
	}

	if state == nil {
		// 从未同步过：不属于冲突
		result.LocalChanged = true
		result.RemoteChanged = false
		return result
	}

	result.LastLocalHash = state.LastLocalHash
	result.LastRemoteHash = state.LastRemoteHash

	localChanged := currentLocalHash != state.LastLocalHash
	remoteChanged := currentRemoteHash != state.LastRemoteHash

	result.LocalChanged = localChanged
	result.RemoteChanged = remoteChanged
	result.HasConflict = localChanged && remoteChanged
	return result
}
