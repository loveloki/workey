package main

import (
	"encoding/json"
	"net/http"
	"strings"
)

// 检查清单及快照 handler

func handleChecklists(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case "GET":
		handleGetChecklists(w, r)
	case "POST":
		handleCreateChecklist(w, r)
	case "PUT":
		handleUpdateChecklist(w, r)
	case "DELETE":
		handleDeleteChecklist(w, r)
	default:
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func handleGetChecklists(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)

	rows, err := db.Query(
		"SELECT id, user_id, title, items, created_at, updated_at FROM checklists WHERE user_id = ? ORDER BY updated_at DESC",
		userID,
	)
	if err != nil {
		jsonError(w, "Internal error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	checklists := []Checklist{}
	for rows.Next() {
		var c Checklist
		rows.Scan(&c.ID, &c.UserID, &c.Title, &c.Items, &c.CreatedAt, &c.UpdatedAt)
		checklists = append(checklists, c)
	}
	jsonOK(w, map[string]interface{}{"checklists": checklists})
}

func handleCreateChecklist(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)

	var req struct {
		Title string            `json:"title"`
		Items []json.RawMessage `json:"items"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if strings.TrimSpace(req.Title) == "" {
		jsonError(w, "Title is required", http.StatusBadRequest)
		return
	}

	if req.Items == nil {
		req.Items = []json.RawMessage{}
	}
	itemsJSON, _ := json.Marshal(req.Items)

	now := nowDatetime()
	result, err := db.Exec(
		"INSERT INTO checklists (user_id, title, items, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
		userID, req.Title, string(itemsJSON), now, now,
	)
	if err != nil {
		jsonError(w, "Failed to create checklist", http.StatusInternalServerError)
		return
	}

	id, _ := result.LastInsertId()
	checklist := Checklist{
		ID:        id,
		UserID:    userID,
		Title:     req.Title,
		Items:     string(itemsJSON),
		CreatedAt: now,
		UpdatedAt: now,
	}
	jsonOK(w, map[string]interface{}{"checklist": checklist})
}

func handleUpdateChecklist(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	id := r.URL.Query().Get("id")
	if id == "" {
		jsonError(w, "id query parameter is required", http.StatusBadRequest)
		return
	}

	var req struct {
		Title *string           `json:"title"`
		Items []json.RawMessage `json:"items"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	var existing Checklist
	err := db.QueryRow(
		"SELECT id, user_id, title, items, created_at, updated_at FROM checklists WHERE id = ? AND user_id = ?",
		id, userID,
	).Scan(&existing.ID, &existing.UserID, &existing.Title, &existing.Items, &existing.CreatedAt, &existing.UpdatedAt)
	if err != nil {
		jsonError(w, "Checklist not found", http.StatusNotFound)
		return
	}

	if req.Title != nil {
		existing.Title = *req.Title
	}
	if req.Items != nil {
		itemsJSON, _ := json.Marshal(req.Items)
		existing.Items = string(itemsJSON)
	}

	now := nowDatetime()
	_, err = db.Exec(
		"UPDATE checklists SET title = ?, items = ?, updated_at = ? WHERE id = ? AND user_id = ?",
		existing.Title, existing.Items, now, id, userID,
	)
	if err != nil {
		jsonError(w, "Failed to update checklist", http.StatusInternalServerError)
		return
	}

	existing.UpdatedAt = now
	jsonOK(w, map[string]interface{}{"checklist": existing})
}

func handleDeleteChecklist(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	id := r.URL.Query().Get("id")
	if id == "" {
		jsonError(w, "id query parameter is required", http.StatusBadRequest)
		return
	}

	result, err := db.Exec("DELETE FROM checklists WHERE id = ? AND user_id = ?", id, userID)
	if err != nil {
		jsonError(w, "Failed to delete checklist", http.StatusInternalServerError)
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		jsonError(w, "Checklist not found", http.StatusNotFound)
		return
	}

	jsonOK(w, map[string]string{"message": "Checklist deleted"})
}

// --- 检查清单快照 ---

func handleChecklistSnapshots(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case "GET":
		handleGetChecklistSnapshots(w, r)
	case "POST":
		handleCreateChecklistSnapshot(w, r)
	case "DELETE":
		handleDeleteChecklistSnapshot(w, r)
	default:
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func handleGetChecklistSnapshots(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	clID := r.URL.Query().Get("checklist_id")
	if clID == "" {
		jsonError(w, "checklist_id is required", http.StatusBadRequest)
		return
	}
	rows, err := db.Query(
		"SELECT id, user_id, checklist_id, title, items_hash, data, created_at FROM checklist_snapshots WHERE user_id = ? AND checklist_id = ? ORDER BY id DESC",
		userID, clID,
	)
	if err != nil {
		jsonError(w, "Internal error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	snapshots := []ChecklistSnapshot{}
	for rows.Next() {
		var s ChecklistSnapshot
		rows.Scan(&s.ID, &s.UserID, &s.ChecklistID, &s.Title, &s.ItemsHash, &s.Data, &s.CreatedAt)
		snapshots = append(snapshots, s)
	}
	jsonOK(w, map[string]interface{}{"snapshots": snapshots})
}

func handleCreateChecklistSnapshot(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	var req struct {
		ChecklistID int64       `json:"checklist_id"`
		Title       string      `json:"title"`
		ItemsHash   string      `json:"items_hash"`
		Data        interface{} `json:"data"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if req.ChecklistID == 0 {
		jsonError(w, "checklist_id is required", http.StatusBadRequest)
		return
	}
	var owner int64
	if err := db.QueryRow("SELECT user_id FROM checklists WHERE id = ?", req.ChecklistID).Scan(&owner); err != nil || owner != userID {
		jsonError(w, "Checklist not found", http.StatusNotFound)
		return
	}
	dataBytes, _ := json.Marshal(req.Data)
	now := nowDatetime()
	result, err := db.Exec(
		"INSERT INTO checklist_snapshots (user_id, checklist_id, title, items_hash, data, created_at) VALUES (?, ?, ?, ?, ?, ?)",
		userID, req.ChecklistID, req.Title, req.ItemsHash, string(dataBytes), now,
	)
	if err != nil {
		jsonError(w, "Failed to save snapshot", http.StatusInternalServerError)
		return
	}
	id, _ := result.LastInsertId()
	jsonOK(w, map[string]interface{}{"snapshot": ChecklistSnapshot{
		ID: id, UserID: userID, ChecklistID: req.ChecklistID,
		Title: req.Title, ItemsHash: req.ItemsHash, Data: string(dataBytes), CreatedAt: now,
	}})
}

func handleDeleteChecklistSnapshot(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	id := r.URL.Query().Get("id")
	if id == "" {
		jsonError(w, "id is required", http.StatusBadRequest)
		return
	}
	result, err := db.Exec("DELETE FROM checklist_snapshots WHERE id = ? AND user_id = ?", id, userID)
	if err != nil {
		jsonError(w, "Failed to delete snapshot", http.StatusInternalServerError)
		return
	}
	if n, _ := result.RowsAffected(); n == 0 {
		jsonError(w, "Snapshot not found", http.StatusNotFound)
		return
	}
	jsonOK(w, map[string]string{"message": "Snapshot deleted"})
}
