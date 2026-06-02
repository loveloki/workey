package app

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// TestDetectConflictFirstSync 首次同步（无 state）不属于冲突
func TestDetectConflictFirstSync(t *testing.T) {
	result := detectConflict("localhash", "remotehash", nil)
	assert.False(t, result.HasConflict)
	assert.True(t, result.LocalChanged)
}

// TestDetectConflictInSync 本地和远端都没有变化
func TestDetectConflictInSync(t *testing.T) {
	state := &SyncState{
		LastLocalHash:  "abc",
		LastRemoteHash: "abc",
	}
	result := detectConflict("abc", "abc", state)
	assert.False(t, result.HasConflict)
	assert.False(t, result.LocalChanged)
	assert.False(t, result.RemoteChanged)
}

// TestDetectConflictLocalAhead 仅本地变化
func TestDetectConflictLocalAhead(t *testing.T) {
	state := &SyncState{
		LastLocalHash:  "old",
		LastRemoteHash: "remote",
	}
	result := detectConflict("new", "remote", state)
	assert.False(t, result.HasConflict)
	assert.True(t, result.LocalChanged)
	assert.False(t, result.RemoteChanged)
}

// TestDetectConflictRemoteAhead 仅远端变化
func TestDetectConflictRemoteAhead(t *testing.T) {
	state := &SyncState{
		LastLocalHash:  "local",
		LastRemoteHash: "old",
	}
	result := detectConflict("local", "new", state)
	assert.False(t, result.HasConflict)
	assert.False(t, result.LocalChanged)
	assert.True(t, result.RemoteChanged)
}

// TestDetectConflictBothChanged 本地和远端同时变化 => 冲突
func TestDetectConflictBothChanged(t *testing.T) {
	state := &SyncState{
		LastLocalHash:  "oldlocal",
		LastRemoteHash: "oldremote",
	}
	result := detectConflict("newlocal", "newremote", state)
	assert.True(t, result.HasConflict)
	assert.True(t, result.LocalChanged)
	assert.True(t, result.RemoteChanged)
}
