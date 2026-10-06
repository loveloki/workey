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

	var checklistID RecordID

	t.Run("创建检查清单", func(t *testing.T) {
		body := `{"title":"每日检查","items":[{"text":"item1","checked":false}]}`
		req := createAuthenticatedRequest(t, "POST", "/api/workey/checklists", body, userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var resp ChecklistResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.Equal(t, "每日检查", resp.Checklist.Title)
		checklistID = resp.Checklist.ID
	})

	t.Run("获取检查清单列表", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "GET", "/api/workey/checklists", "", userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var resp ChecklistListResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.Len(t, resp.Checklists, 1)
		assert.Contains(t, resp.Checklists, Checklist{
			ID: checklistID, UserID: RecordID(userID), Title: "每日检查", Items: `[{"text":"item1","checked":false}]`,
			Kind: checklistKindManual, CreatedAt: resp.Checklists[0].CreatedAt, UpdatedAt: resp.Checklists[0].UpdatedAt,
		})
	})

	t.Run("更新检查清单标题", func(t *testing.T) {
		body := `{"title":"更新后的标题"}`
		url := fmt.Sprintf("/api/workey/checklists?id=%s", checklistID)
		req := createAuthenticatedRequest(t, "PUT", url, body, userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var resp ChecklistResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.Equal(t, "更新后的标题", resp.Checklist.Title)
	})

	t.Run("删除检查清单", func(t *testing.T) {
		url := fmt.Sprintf("/api/workey/checklists?id=%s", checklistID)
		req := createAuthenticatedRequest(t, "DELETE", url, "", userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
	})

	t.Run("创建时标题不能为空", func(t *testing.T) {
		body := `{"title":"","items":[]}`
		req := createAuthenticatedRequest(t, "POST", "/api/workey/checklists", body, userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("删除不存在的清单", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "DELETE", "/api/workey/checklists?id=99999", "", userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusNotFound, rr.Code)
	})

	t.Run("更新不存在的清单", func(t *testing.T) {
		body := `{"title":"不存在"}`
		req := createAuthenticatedRequest(t, "PUT", "/api/workey/checklists?id=99999", body, userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusNotFound, rr.Code)
	})

	t.Run("缺少 id 参数时删除", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "DELETE", "/api/workey/checklists", "", userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})
}

func TestHandleChecklistSnapshots_CRUD(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "snapuser", "password123")

	// 先创建一个 checklist
	body := `{"title":"快照测试清单","items":[{"text":"item1","checked":false}]}`
	req := createAuthenticatedRequest(t, "POST", "/api/workey/checklists", body, userID)
	rr := httptest.NewRecorder()
	serveTest(rr, req)
	require.Equal(t, http.StatusOK, rr.Code)

	var clResp ChecklistResponse
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &clResp))
	clID := clResp.Checklist.ID

	var snapshotID RecordID

	t.Run("创建快照", func(t *testing.T) {
		body := fmt.Sprintf(`{"checklist_id":"%s","title":"v1","items_hash":"abc123","data":{"checked":[true]}}`, clID)
		req := createAuthenticatedRequest(t, "POST", "/api/workey/checklist-snapshots", body, userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var resp SnapshotResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.Equal(t, "v1", resp.Snapshot.Title)
		snapshotID = resp.Snapshot.ID
	})

	t.Run("获取快照列表", func(t *testing.T) {
		url := fmt.Sprintf("/api/workey/checklist-snapshots?checklist_id=%s", clID)
		req := createAuthenticatedRequest(t, "GET", url, "", userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var resp SnapshotListResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.Len(t, resp.Snapshots, 1)
	})

	t.Run("缺少 checklist_id 获取快照", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "GET", "/api/workey/checklist-snapshots", "", userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("创建快照时 checklist 不存在", func(t *testing.T) {
		body := `{"checklist_id":"missing99999","title":"v2","items_hash":"xyz","data":{}}`
		req := createAuthenticatedRequest(t, "POST", "/api/workey/checklist-snapshots", body, userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusNotFound, rr.Code)
	})

	t.Run("删除快照", func(t *testing.T) {
		url := fmt.Sprintf("/api/workey/checklist-snapshots?id=%s", snapshotID)
		req := createAuthenticatedRequest(t, "DELETE", url, "", userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
	})

	t.Run("删除不存在的快照", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "DELETE", "/api/workey/checklist-snapshots?id=99999", "", userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusNotFound, rr.Code)
	})

	t.Run("删除快照缺少 id", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "DELETE", "/api/workey/checklist-snapshots", "", userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("创建快照缺少 checklist_id", func(t *testing.T) {
		body := `{"title":"v1","items_hash":"abc","data":{}}`
		req := createAuthenticatedRequest(t, "POST", "/api/workey/checklist-snapshots", body, userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("PUT 方法不允许", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "PUT", "/api/workey/checklist-snapshots", "", userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusNotFound, rr.Code)
	})
}

func TestHandleChecklistUpdate_Items(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "upditems", "password123")

	// 创建清单
	body := `{"title":"更新Items","items":[{"text":"原始","checked":false}]}`
	req := createAuthenticatedRequest(t, "POST", "/api/workey/checklists", body, userID)
	rr := httptest.NewRecorder()
	serveTest(rr, req)
	require.Equal(t, http.StatusOK, rr.Code)

	var clResp ChecklistResponse
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &clResp))
	clID := clResp.Checklist.ID

	t.Run("更新 items", func(t *testing.T) {
		body := `{"items":[{"text":"更新后","checked":true}]}`
		url := fmt.Sprintf("/api/workey/checklists?id=%s", clID)
		req := createAuthenticatedRequest(t, "PUT", url, body, userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
	})

	t.Run("无效 JSON 请求体", func(t *testing.T) {
		url := fmt.Sprintf("/api/workey/checklists?id=%s", clID)
		req := createAuthenticatedRequest(t, "PUT", url, "bad json", userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("无效 JSON 创建清单", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "POST", "/api/workey/checklists", "bad", userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("无效 JSON 创建快照", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "POST", "/api/workey/checklist-snapshots", "bad", userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})
}

func TestDeleteChecklistCascadesSnapshots(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := createTestUser(t, "cascadeuser", "password123")
	checklist := insertTestRecord(t, checklistCollection, userID, map[string]any{"title": "将删除", "items": "[]"})
	insertTestRecord(t, snapshotCollection, userID, map[string]any{"checklist": checklist.Id, "data": "{}"})
	other := insertTestRecord(t, checklistCollection, userID, map[string]any{"title": "保留", "items": "[]"})
	insertTestRecord(t, snapshotCollection, userID, map[string]any{"checklist": other.Id, "data": "{}"})

	rr := httptest.NewRecorder()
	serveTest(rr, createAuthenticatedRequest(t, "DELETE", "/api/workey/checklists?id="+checklist.Id, "", userID))
	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())
	snapshots, err := testApp.FindAllRecords(snapshotCollection)
	require.NoError(t, err)
	require.Len(t, snapshots, 1)
	assert.Equal(t, other.Id, snapshots[0].GetString("checklist"))
}
