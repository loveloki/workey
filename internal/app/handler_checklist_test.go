package app

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestHandleChecklists_CRUD(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "cluser", "password123")

	var checklistID int64

	t.Run("创建检查清单", func(t *testing.T) {
		body := `{"title":"每日检查","items":[{"text":"item1","checked":false}]}`
		req := createAuthenticatedRequest(t, "POST", "/api/checklists", body, userID)
		rr := httptest.NewRecorder()

		handleChecklists(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var resp ChecklistResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.Equal(t, "每日检查", resp.Checklist.Title)
		checklistID = resp.Checklist.ID
	})

	t.Run("获取检查清单列表", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "GET", "/api/checklists", "", userID)
		rr := httptest.NewRecorder()

		handleChecklists(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var resp ChecklistListResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.Len(t, resp.Checklists, 3)
		assert.Contains(t, resp.Checklists, Checklist{
			ID: checklistID, UserID: userID, Title: "每日检查", Items: `[{"text":"item1","checked":false}]`,
			Kind: checklistKindManual, CreatedAt: resp.Checklists[2].CreatedAt, UpdatedAt: resp.Checklists[2].UpdatedAt,
		})
	})

	t.Run("更新检查清单标题", func(t *testing.T) {
		body := `{"title":"更新后的标题"}`
		url := fmt.Sprintf("/api/checklists?id=%d", checklistID)
		req := createAuthenticatedRequest(t, "PUT", url, body, userID)
		rr := httptest.NewRecorder()

		handleChecklists(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var resp ChecklistResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.Equal(t, "更新后的标题", resp.Checklist.Title)
	})

	t.Run("删除检查清单", func(t *testing.T) {
		url := fmt.Sprintf("/api/checklists?id=%d", checklistID)
		req := createAuthenticatedRequest(t, "DELETE", url, "", userID)
		rr := httptest.NewRecorder()

		handleChecklists(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
	})

	t.Run("创建时标题不能为空", func(t *testing.T) {
		body := `{"title":"","items":[]}`
		req := createAuthenticatedRequest(t, "POST", "/api/checklists", body, userID)
		rr := httptest.NewRecorder()

		handleChecklists(rr, req)

		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("删除不存在的清单", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "DELETE", "/api/checklists?id=99999", "", userID)
		rr := httptest.NewRecorder()

		handleChecklists(rr, req)

		assert.Equal(t, http.StatusNotFound, rr.Code)
	})

	t.Run("更新不存在的清单", func(t *testing.T) {
		body := `{"title":"不存在"}`
		req := createAuthenticatedRequest(t, "PUT", "/api/checklists?id=99999", body, userID)
		rr := httptest.NewRecorder()

		handleChecklists(rr, req)

		assert.Equal(t, http.StatusNotFound, rr.Code)
	})

	t.Run("缺少 id 参数时删除", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "DELETE", "/api/checklists", "", userID)
		rr := httptest.NewRecorder()

		handleChecklists(rr, req)

		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})
}

func TestHandleChecklistSnapshots_CRUD(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "snapuser", "password123")

	// 先创建一个 checklist
	body := `{"title":"快照测试清单","items":[{"text":"item1","checked":false}]}`
	req := createAuthenticatedRequest(t, "POST", "/api/checklists", body, userID)
	rr := httptest.NewRecorder()
	handleChecklists(rr, req)
	require.Equal(t, http.StatusOK, rr.Code)

	var clResp ChecklistResponse
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &clResp))
	clID := clResp.Checklist.ID

	var snapshotID int64

	t.Run("创建快照", func(t *testing.T) {
		body := fmt.Sprintf(`{"checklist_id":%d,"title":"v1","items_hash":"abc123","data":{"checked":[true]}}`, clID)
		req := createAuthenticatedRequest(t, "POST", "/api/checklist-snapshots", body, userID)
		rr := httptest.NewRecorder()

		handleChecklistSnapshots(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var resp SnapshotResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.Equal(t, "v1", resp.Snapshot.Title)
		snapshotID = resp.Snapshot.ID
	})

	t.Run("获取快照列表", func(t *testing.T) {
		url := fmt.Sprintf("/api/checklist-snapshots?checklist_id=%d", clID)
		req := createAuthenticatedRequest(t, "GET", url, "", userID)
		rr := httptest.NewRecorder()

		handleChecklistSnapshots(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var resp SnapshotListResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.Len(t, resp.Snapshots, 1)
	})

	t.Run("缺少 checklist_id 获取快照", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "GET", "/api/checklist-snapshots", "", userID)
		rr := httptest.NewRecorder()

		handleChecklistSnapshots(rr, req)

		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("创建快照时 checklist 不存在", func(t *testing.T) {
		body := `{"checklist_id":99999,"title":"v2","items_hash":"xyz","data":{}}`
		req := createAuthenticatedRequest(t, "POST", "/api/checklist-snapshots", body, userID)
		rr := httptest.NewRecorder()

		handleChecklistSnapshots(rr, req)

		assert.Equal(t, http.StatusNotFound, rr.Code)
	})

	t.Run("删除快照", func(t *testing.T) {
		url := fmt.Sprintf("/api/checklist-snapshots?id=%d", snapshotID)
		req := createAuthenticatedRequest(t, "DELETE", url, "", userID)
		rr := httptest.NewRecorder()

		handleChecklistSnapshots(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
	})

	t.Run("删除不存在的快照", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "DELETE", "/api/checklist-snapshots?id=99999", "", userID)
		rr := httptest.NewRecorder()

		handleChecklistSnapshots(rr, req)

		assert.Equal(t, http.StatusNotFound, rr.Code)
	})

	t.Run("删除快照缺少 id", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "DELETE", "/api/checklist-snapshots", "", userID)
		rr := httptest.NewRecorder()

		handleChecklistSnapshots(rr, req)

		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("创建快照缺少 checklist_id", func(t *testing.T) {
		body := `{"title":"v1","items_hash":"abc","data":{}}`
		req := createAuthenticatedRequest(t, "POST", "/api/checklist-snapshots", body, userID)
		rr := httptest.NewRecorder()

		handleChecklistSnapshots(rr, req)

		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("PUT 方法不允许", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "PUT", "/api/checklist-snapshots", "", userID)
		rr := httptest.NewRecorder()

		handleChecklistSnapshots(rr, req)

		assert.Equal(t, http.StatusMethodNotAllowed, rr.Code)
	})
}

func TestHandleChecklistUpdate_Items(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "upditems", "password123")

	// 创建清单
	body := `{"title":"更新Items","items":[{"text":"原始","checked":false}]}`
	req := createAuthenticatedRequest(t, "POST", "/api/checklists", body, userID)
	rr := httptest.NewRecorder()
	handleChecklists(rr, req)
	require.Equal(t, http.StatusOK, rr.Code)

	var clResp ChecklistResponse
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &clResp))
	clID := clResp.Checklist.ID

	t.Run("更新 items", func(t *testing.T) {
		body := `{"items":[{"text":"更新后","checked":true}]}`
		url := fmt.Sprintf("/api/checklists?id=%d", clID)
		req := createAuthenticatedRequest(t, "PUT", url, body, userID)
		rr := httptest.NewRecorder()

		handleChecklists(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
	})

	t.Run("无效 JSON 请求体", func(t *testing.T) {
		url := fmt.Sprintf("/api/checklists?id=%d", clID)
		req := createAuthenticatedRequest(t, "PUT", url, "bad json", userID)
		rr := httptest.NewRecorder()

		handleChecklists(rr, req)

		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("无效 JSON 创建清单", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "POST", "/api/checklists", "bad", userID)
		rr := httptest.NewRecorder()

		handleChecklists(rr, req)

		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("无效 JSON 创建快照", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "POST", "/api/checklist-snapshots", "bad", userID)
		rr := httptest.NewRecorder()

		handleChecklistSnapshots(rr, req)

		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})
}
