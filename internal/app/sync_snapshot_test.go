package app

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestComputeDataHashDeterministic hash 应确定性：相同数据多次计算结果一致
func TestComputeDataHashDeterministic(t *testing.T) {
	data := makeTestExportData()
	h1, err := computeDataHash(data)
	require.NoError(t, err)

	// 修改 ExportedAt（不应影响 hash）
	data.ExportedAt = time.Now().Add(time.Hour).Format(time.RFC3339)
	h2, err := computeDataHash(data)
	require.NoError(t, err)

	assert.Equal(t, h1, h2, "ExportedAt 应不影响 hash")
}

// TestComputeDataHashChanges 数据变化后 hash 应不同
func TestComputeDataHashChanges(t *testing.T) {
	data1 := makeTestExportData()
	h1, _ := computeDataHash(data1)

	data2 := makeTestExportData()
	data2.Attendance[0].Status = "leave" // 修改一个字段
	h2, _ := computeDataHash(data2)

	assert.NotEqual(t, h1, h2, "数据变化后 hash 应不同")
}

// TestComputeDataHashUserSettingsOrder user_settings 阶序不影响 hash
func TestComputeDataHashUserSettingsOrder(t *testing.T) {
	data1 := &ExportData{
		Attendance:         []Attendance{},
		WorkLogs:           []WorkLog{},
		Todos:              []Todo{},
		Checklists:         []Checklist{},
		ChecklistSnapshots: []ChecklistSnapshot{},
		IterationOverrides: []IterationOverride{},
		UserSettings:       map[string]string{"tz": "UTC", "theme": "dark"},
	}
	data2 := &ExportData{
		Attendance:         []Attendance{},
		WorkLogs:           []WorkLog{},
		Todos:              []Todo{},
		Checklists:         []Checklist{},
		ChecklistSnapshots: []ChecklistSnapshot{},
		IterationOverrides: []IterationOverride{},
		UserSettings:       map[string]string{"theme": "dark", "tz": "UTC"}, // 不同顺序
	}
	h1, _ := computeDataHash(data1)
	h2, _ := computeDataHash(data2)
	assert.Equal(t, h1, h2, "user_settings 顺序不应影响 hash")
}

// TestBuildAndDecryptSnapshot 快照加密解密循环
func TestBuildAndDecryptSnapshot(t *testing.T) {
	encKey := deriveKey([]byte("test-enc-key"), []byte("test-salt"))
	data := makeTestExportData()

	encrypted, hash, err := buildEncryptedSnapshot(context.Background(), data, encKey)
	require.NoError(t, err)
	assert.NotEmpty(t, hash)
	assert.NotEmpty(t, encrypted)

	// 解密并验证数据
	decrypted, err := decryptSnapshot(context.Background(), encrypted, encKey)
	require.NoError(t, err)
	assert.Equal(t, len(data.Attendance), len(decrypted.Attendance))
	assert.Equal(t, len(data.WorkLogs), len(decrypted.WorkLogs))
	assert.Equal(t, len(data.TicketIssues), len(decrypted.TicketIssues))
	assert.Equal(t, len(data.ChecklistRuns), len(decrypted.ChecklistRuns))

	// 验证 hash 一致
	decryptedHash, err := computeDataHash(decrypted)
	require.NoError(t, err)
	assert.Equal(t, hash, decryptedHash)
}

// TestDecryptSnapshotWrongKey 错误密鑰应失败
func TestDecryptSnapshotWrongKey(t *testing.T) {
	encKey := deriveKey([]byte("correct-key"), []byte("test-salt"))
	wrongKey := deriveKey([]byte("wrong-key"), []byte("test-salt"))
	data := makeTestExportData()

	encrypted, _, err := buildEncryptedSnapshot(context.Background(), data, encKey)
	require.NoError(t, err)

	_, err = decryptSnapshot(context.Background(), encrypted, wrongKey)
	assert.Error(t, err)
}

// TestReplaceImportDataNoduplicates 替换式导入同一快照多次不产生重复数据
func TestReplaceImportDataNoduplicates(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "user1", "pass")
	data := makeTestExportData()

	// 第一次导入
	tx1, err := db.Begin()
	require.NoError(t, err)
	err = replaceImportData(context.Background(), tx1, userID, data)
	require.NoError(t, err)
	require.NoError(t, tx1.Commit())

	var count1 int
	db.QueryRow("SELECT COUNT(*) FROM attendance WHERE user_id = ?", userID).Scan(&count1)
	assert.Equal(t, len(data.Attendance), count1)

	// 第二次导入同一快照
	tx2, err := db.Begin()
	require.NoError(t, err)
	err = replaceImportData(context.Background(), tx2, userID, data)
	require.NoError(t, err)
	require.NoError(t, tx2.Commit())

	var count2 int
	db.QueryRow("SELECT COUNT(*) FROM attendance WHERE user_id = ?", userID).Scan(&count2)
	assert.Equal(t, len(data.Attendance), count2, "重复导入同快片不应产生重复数据")

	// todos 也不应重复
	var todoCnt int
	db.QueryRow("SELECT COUNT(*) FROM todos WHERE user_id = ?", userID).Scan(&todoCnt)
	assert.Equal(t, len(data.Todos), todoCnt, "todos 不应重复")

	var ticketIssueCnt int
	db.QueryRow("SELECT COUNT(*) FROM ticket_issues WHERE user_id = ?", userID).Scan(&ticketIssueCnt)
	assert.Equal(t, len(data.TicketIssues), ticketIssueCnt, "ticket_issues 不应重复")

	var checklistRunCnt int
	db.QueryRow("SELECT COUNT(*) FROM checklist_runs WHERE user_id = ?", userID).Scan(&checklistRunCnt)
	assert.Equal(t, len(data.ChecklistRuns), checklistRunCnt, "checklist_runs 不应重复")
}

// TestReplaceImportDataRollbackOnError 导入失败应 rollback（M3：修复逻辑缺陷）
func TestReplaceImportDataRollbackOnError(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "user2", "pass")

	// 先插入一条初始记录
	db.Exec("INSERT INTO attendance (user_id, date, status) VALUES (?, '2024-01-01', 'normal')", userID)

	var beforeCount int
	db.QueryRow("SELECT COUNT(*) FROM attendance WHERE user_id = ?", userID).Scan(&beforeCount)
	assert.Equal(t, 1, beforeCount)

	// 构造一个会导致失败的数据（重复日期会违反 UNIQUE 约束）
	badData := &ExportData{
		Attendance: []Attendance{
			{Date: "2024-02-01", Status: "normal"},
			{Date: "2024-02-01", Status: "normal"},
		},
		WorkLogs:           []WorkLog{},
		Todos:              []Todo{},
		Checklists:         []Checklist{},
		ChecklistSnapshots: []ChecklistSnapshot{},
		IterationOverrides: []IterationOverride{},
		UserSettings:       map[string]string{},
	}

	tx, err := db.Begin()
	require.NoError(t, err)
	// M3: 必须断言返回错误，且显式回滚事务避免事务泄漏
	err = replaceImportData(context.Background(), tx, userID, badData)
	require.Error(t, err, "重复日期应导致 UNIQUE 约束冲突")
	tx.Rollback()

	// rollback 后旧数据仍应存在
	var afterCount int
	db.QueryRow("SELECT COUNT(*) FROM attendance WHERE user_id = ?", userID).Scan(&afterCount)
	assert.Equal(t, 1, afterCount, "rollback 后旧数据应保留")
}

// makeTestExportData 构造测试用 ExportData
func makeTestExportData() *ExportData {
	return &ExportData{
		Attendance: []Attendance{
			{ID: 1, UserID: 1, Date: "2024-01-01", Status: "normal", CreatedAt: "2024-01-01 09:00:00", UpdatedAt: "2024-01-01 09:00:00"},
			{ID: 2, UserID: 1, Date: "2024-01-02", Status: "normal", CreatedAt: "2024-01-02 09:00:00", UpdatedAt: "2024-01-02 09:00:00"},
		},
		WorkLogs: []WorkLog{
			{ID: 1, UserID: 1, Date: "2024-01-01", Content: "done stuff", CreatedAt: "2024-01-01 18:00:00", UpdatedAt: "2024-01-01 18:00:00"},
		},
		Todos: []Todo{
			{ID: 1, UserID: 1, Content: "buy milk", URL: "", Done: false, CreatedAt: "2024-01-01 10:00:00", UpdatedAt: "2024-01-01 10:00:00"},
		},
		TicketIssues: []TicketIssue{
			{ID: 1, UserID: 1, TicketNo: "WO-1", TicketTitle: "Login failed", OccurredOn: "2024-01-01", CauseType: "code", ProblemDescription: "Users cannot login", CauseDetail: "Nil pointer", Resolution: "Add validation", CreatedAt: "2024-01-01 11:00:00", UpdatedAt: "2024-01-01 12:00:00"},
		},
		Checklists: []Checklist{
			{ID: 1, UserID: 1, Title: "Daily", Items: `["task1"]`, Kind: checklistKindDailyStart, CreatedAt: "2024-01-01 08:00:00", UpdatedAt: "2024-01-01 08:00:00"},
		},
		ChecklistRuns: []ChecklistRun{
			{ID: 1, UserID: 1, ChecklistID: 1, Kind: checklistKindDailyStart, OccurrenceKey: "2024-01-01", Title: "Daily", Items: `["task1"]`, Data: `{"checked":[true],"notes":[""]}`, Completed: true, CreatedAt: "2024-01-01 09:00:00", UpdatedAt: "2024-01-01 09:00:00"},
		},
		ChecklistSnapshots: []ChecklistSnapshot{
			{ID: 1, UserID: 1, ChecklistID: 1, Title: "Daily", ItemsHash: "abc", Data: `{"checked":[true]}`, CreatedAt: "2024-01-01 20:00:00"},
		},
		IterationOverrides: []IterationOverride{},
		UserSettings:       map[string]string{"timezone": "Asia/Shanghai"},
		ExportedAt:         "2024-01-01T00:00:00Z",
	}
}
