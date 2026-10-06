package app

import (
	"encoding/json"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"
)

// 检查清单及快照 handler

const checklistKindManual = "manual"

func handleGetChecklists(e *core.RequestEvent) error {
	records, err := findUserRecords(e.App, checklistCollection, "", "-updated,-@rowid", dbx.Params{"user": e.Auth.Id})
	if err != nil {
		return e.InternalServerError("Internal error", err)
	}
	return e.JSON(200, ChecklistListResponse{Checklists: mapRecords(records, checklistFromRecord)})
}

func handleCreateChecklist(e *core.RequestEvent) error {
	var req struct {
		Title string            `json:"title"`
		Items []json.RawMessage `json:"items"`
	}
	if err := e.BindBody(&req); err != nil {
		return e.BadRequestError("Invalid request body", err)
	}
	if strings.TrimSpace(req.Title) == "" {
		return e.BadRequestError("Title is required", nil)
	}
	if req.Items == nil {
		req.Items = []json.RawMessage{}
	}
	items, err := json.Marshal(req.Items)
	if err != nil {
		return e.BadRequestError("Invalid checklist items", err)
	}
	record, err := newUserRecord(e.App, checklistCollection, e.Auth.Id)
	if err != nil {
		return e.InternalServerError("Failed to create checklist", err)
	}
	record.Set("title", req.Title)
	record.Set("items", types.JSONRaw(items))
	if err := e.App.Save(record); err != nil {
		return e.InternalServerError("Failed to create checklist", err)
	}
	return e.JSON(200, ChecklistResponse{Checklist: checklistFromRecord(record)})
}

func handleUpdateChecklist(e *core.RequestEvent) error {
	id := e.Request.URL.Query().Get("id")
	if id == "" {
		return e.BadRequestError("id query parameter is required", nil)
	}
	var req struct {
		Title *string           `json:"title"`
		Items []json.RawMessage `json:"items"`
	}
	if err := e.BindBody(&req); err != nil {
		return e.BadRequestError("Invalid request body", err)
	}
	record, err := requireOwnedRecord(e, checklistCollection, id, "Checklist")
	if err != nil {
		return err
	}
	if req.Title != nil {
		if strings.TrimSpace(*req.Title) == "" {
			return e.BadRequestError("Title is required", nil)
		}
		record.Set("title", *req.Title)
	}
	if req.Items != nil {
		items, err := json.Marshal(req.Items)
		if err != nil {
			return e.BadRequestError("Invalid checklist items", err)
		}
		record.Set("items", types.JSONRaw(items))
	}
	if err := e.App.Save(record); err != nil {
		return e.InternalServerError("Failed to update checklist", err)
	}
	return e.JSON(200, ChecklistResponse{Checklist: checklistFromRecord(record)})
}

// handleDeleteChecklist 删除清单，其快照由 relation 的 CascadeDelete 一并删除。
func handleDeleteChecklist(e *core.RequestEvent) error {
	return deleteOwnedRecord(e, checklistCollection, "Checklist")
}

// --- 检查清单快照 ---

func handleGetChecklistSnapshots(e *core.RequestEvent) error {
	checklistID := e.Request.URL.Query().Get("checklist_id")
	if checklistID == "" {
		return e.BadRequestError("checklist_id is required", nil)
	}
	records, err := findUserRecords(e.App, snapshotCollection, "checklist = {:checklist}", "-created,-@rowid",
		dbx.Params{"user": e.Auth.Id, "checklist": checklistID})
	if err != nil {
		return e.InternalServerError("Internal error", err)
	}
	return e.JSON(200, SnapshotListResponse{Snapshots: mapRecords(records, snapshotFromRecord)})
}

func handleCreateChecklistSnapshot(e *core.RequestEvent) error {
	var req struct {
		ChecklistID string          `json:"checklist_id"`
		Title       string          `json:"title"`
		ItemsHash   string          `json:"items_hash"`
		Data        json.RawMessage `json:"data"`
	}
	if err := e.BindBody(&req); err != nil {
		return e.BadRequestError("Invalid request body", err)
	}
	if req.ChecklistID == "" {
		return e.BadRequestError("checklist_id is required", nil)
	}
	if _, err := requireOwnedRecord(e, checklistCollection, req.ChecklistID, "Checklist"); err != nil {
		return err
	}
	if len(req.Data) == 0 {
		req.Data = json.RawMessage("null")
	}
	record, err := newUserRecord(e.App, snapshotCollection, e.Auth.Id)
	if err != nil {
		return e.InternalServerError("Failed to save snapshot", err)
	}
	record.Set("checklist", req.ChecklistID)
	record.Set("title", req.Title)
	record.Set("items_hash", req.ItemsHash)
	record.Set("data", types.JSONRaw(req.Data))
	if err := e.App.Save(record); err != nil {
		return e.InternalServerError("Failed to save snapshot", err)
	}
	return e.JSON(200, SnapshotResponse{Snapshot: snapshotFromRecord(record)})
}

func handleDeleteChecklistSnapshot(e *core.RequestEvent) error {
	return deleteOwnedRecord(e, snapshotCollection, "Snapshot")
}
