package app

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"
)

// 待办事项 handler

func handleTodos(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case "GET":
		handleGetTodos(w, r)
	case "POST":
		handleCreateTodo(w, r)
	case "PUT":
		handleUpdateTodo(w, r)
	case "DELETE":
		handleDeleteTodo(w, r)
	default:
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func handleCreatedTodayTodos(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserID(r)
	todayStr := today()

	rows, err := db.Query(
		"SELECT id, user_id, content, url, done, created_at, updated_at FROM todos WHERE user_id = ? AND date(created_at) = ? ORDER BY created_at DESC",
		userID, todayStr,
	)
	if err != nil {
		jsonError(w, "Internal error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	todos := []Todo{}
	for rows.Next() {
		var t Todo
		var done int
		rows.Scan(&t.ID, &t.UserID, &t.Content, &t.URL, &done, &t.CreatedAt, &t.UpdatedAt)
		t.Done = done != 0
		todos = append(todos, t)
	}
	jsonOK(w, TodoListResponse{Todos: todos})
}

func handleCompletedTodayTodos(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserID(r)
	todayStr := today()

	rows, err := db.Query(
		"SELECT id, user_id, content, url, done, created_at, updated_at FROM todos WHERE user_id = ? AND done = 1 AND date(updated_at) = ? ORDER BY updated_at DESC",
		userID, todayStr,
	)
	if err != nil {
		jsonError(w, "Internal error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	todos := []Todo{}
	for rows.Next() {
		var t Todo
		var done int
		rows.Scan(&t.ID, &t.UserID, &t.Content, &t.URL, &done, &t.CreatedAt, &t.UpdatedAt)
		t.Done = done != 0
		todos = append(todos, t)
	}
	jsonOK(w, TodoListResponse{Todos: todos})
}

func handleCompletedRangeTodos(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserID(r)
	start := r.URL.Query().Get("start")
	end := r.URL.Query().Get("end")
	if start == "" || end == "" {
		jsonError(w, "start and end required", http.StatusBadRequest)
		return
	}

	rows, err := db.Query(
		"SELECT id, user_id, content, url, done, created_at, updated_at FROM todos WHERE user_id = ? AND done = 1 AND date(updated_at) >= ? AND date(updated_at) <= ? ORDER BY updated_at DESC",
		userID, start, end,
	)
	if err != nil {
		jsonError(w, "Internal error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	todos := []Todo{}
	for rows.Next() {
		var t Todo
		var done int
		rows.Scan(&t.ID, &t.UserID, &t.Content, &t.URL, &done, &t.CreatedAt, &t.UpdatedAt)
		t.Done = done != 0
		todos = append(todos, t)
	}
	jsonOK(w, TodoListResponse{Todos: todos})
}

func handleGetTodos(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	all := r.URL.Query().Get("all")

	var rows *sql.Rows
	var err error
	if all == "1" {
		rows, err = db.Query(
			"SELECT id, user_id, content, url, done, created_at, updated_at FROM todos WHERE user_id = ? ORDER BY created_at DESC",
			userID,
		)
	} else {
		rows, err = db.Query(
			"SELECT id, user_id, content, url, done, created_at, updated_at FROM todos WHERE user_id = ? AND done = 0 ORDER BY created_at DESC",
			userID,
		)
	}
	if err != nil {
		jsonError(w, "Internal error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	todos := []Todo{}
	for rows.Next() {
		var t Todo
		var done int
		rows.Scan(&t.ID, &t.UserID, &t.Content, &t.URL, &done, &t.CreatedAt, &t.UpdatedAt)
		t.Done = done != 0
		todos = append(todos, t)
	}
	jsonOK(w, TodoListResponse{Todos: todos})
}

func handleCreateTodo(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)

	var req struct {
		Content string `json:"content"`
		URL     string `json:"url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if strings.TrimSpace(req.Content) == "" && strings.TrimSpace(req.URL) == "" {
		jsonError(w, "Content or URL is required", http.StatusBadRequest)
		return
	}

	now := nowDatetime()
	result, err := db.Exec(
		"INSERT INTO todos (user_id, content, url, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
		userID, req.Content, req.URL, now, now,
	)
	if err != nil {
		jsonError(w, "Failed to create todo", http.StatusInternalServerError)
		return
	}

	id, _ := result.LastInsertId()
	todo := Todo{
		ID:        id,
		UserID:    userID,
		Content:   req.Content,
		URL:       req.URL,
		Done:      false,
		CreatedAt: now,
		UpdatedAt: now,
	}
	jsonOK(w, TodoResponse{Todo: todo})
}

func handleUpdateTodo(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	id := r.URL.Query().Get("id")
	if id == "" {
		jsonError(w, "id query parameter is required", http.StatusBadRequest)
		return
	}

	var req struct {
		Content *string `json:"content"`
		URL     *string `json:"url"`
		Done    *bool   `json:"done"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	var existing Todo
	var done int
	err := db.QueryRow(
		"SELECT id, user_id, content, url, done, created_at, updated_at FROM todos WHERE id = ? AND user_id = ?",
		id, userID,
	).Scan(&existing.ID, &existing.UserID, &existing.Content, &existing.URL, &done, &existing.CreatedAt, &existing.UpdatedAt)
	if err != nil {
		jsonError(w, "Todo not found", http.StatusNotFound)
		return
	}
	existing.Done = done != 0

	if req.Content != nil {
		existing.Content = *req.Content
	}
	if req.URL != nil {
		existing.URL = *req.URL
	}
	if req.Done != nil {
		existing.Done = *req.Done
	}

	now := nowDatetime()
	doneInt := 0
	if existing.Done {
		doneInt = 1
	}
	_, err = db.Exec(
		"UPDATE todos SET content = ?, url = ?, done = ?, updated_at = ? WHERE id = ? AND user_id = ?",
		existing.Content, existing.URL, doneInt, now, id, userID,
	)
	if err != nil {
		jsonError(w, "Failed to update todo", http.StatusInternalServerError)
		return
	}

	existing.UpdatedAt = now
	jsonOK(w, TodoResponse{Todo: existing})
}

func handleDeleteTodo(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	id := r.URL.Query().Get("id")
	if id == "" {
		jsonError(w, "id query parameter is required", http.StatusBadRequest)
		return
	}

	result, err := db.Exec("DELETE FROM todos WHERE id = ? AND user_id = ?", id, userID)
	if err != nil {
		jsonError(w, "Failed to delete todo", http.StatusInternalServerError)
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		jsonError(w, "Todo not found", http.StatusNotFound)
		return
	}

	jsonOK(w, MessageResponse{Message: "Todo deleted"})
}
