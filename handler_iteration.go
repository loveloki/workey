package main

import (
	"encoding/json"
	"net/http"
	"time"
)

// 迭代周期覆盖 handler

func handleIterationOverrides(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case "GET":
		handleGetIterationOverrides(w, r)
	case "POST":
		handleCreateIterationOverride(w, r)
	case "DELETE":
		handleDeleteIterationOverride(w, r)
	default:
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func handleGetIterationOverrides(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)

	rows, err := db.Query(
		"SELECT id, user_id, iteration_number, start_date, end_date, created_at, updated_at FROM iteration_overrides WHERE user_id = ? ORDER BY iteration_number",
		userID,
	)
	if err != nil {
		jsonError(w, "Internal error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	overrides := []IterationOverride{}
	for rows.Next() {
		var o IterationOverride
		rows.Scan(&o.ID, &o.UserID, &o.IterationNumber, &o.StartDate, &o.EndDate, &o.CreatedAt, &o.UpdatedAt)
		overrides = append(overrides, o)
	}
	jsonOK(w, map[string]interface{}{"overrides": overrides})
}

func handleCreateIterationOverride(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)

	var req struct {
		IterationNumber int64  `json:"iteration_number"`
		StartDate       string `json:"start_date"`
		EndDate         string `json:"end_date"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.IterationNumber < 1 {
		jsonError(w, "iteration_number must be >= 1", http.StatusBadRequest)
		return
	}

	startDate, err := time.Parse("2006-01-02", req.StartDate)
	if err != nil {
		jsonError(w, "start_date must be in YYYY-MM-DD format", http.StatusBadRequest)
		return
	}

	endDate, err := time.Parse("2006-01-02", req.EndDate)
	if err != nil {
		jsonError(w, "end_date must be in YYYY-MM-DD format", http.StatusBadRequest)
		return
	}

	if startDate.After(endDate) {
		jsonError(w, "start_date must be <= end_date", http.StatusBadRequest)
		return
	}

	now := nowDatetime()

	result, err := db.Exec(
		"UPDATE iteration_overrides SET start_date = ?, end_date = ?, updated_at = ? WHERE user_id = ? AND iteration_number = ?",
		req.StartDate, req.EndDate, now, userID, req.IterationNumber,
	)
	if err != nil {
		jsonError(w, "Internal error", http.StatusInternalServerError)
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		_, err = db.Exec(
			"INSERT INTO iteration_overrides (user_id, iteration_number, start_date, end_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
			userID, req.IterationNumber, req.StartDate, req.EndDate, now, now,
		)
		if err != nil {
			jsonError(w, "Internal error", http.StatusInternalServerError)
			return
		}
	}

	var o IterationOverride
	err = db.QueryRow(
		"SELECT id, user_id, iteration_number, start_date, end_date, created_at, updated_at FROM iteration_overrides WHERE user_id = ? AND iteration_number = ?",
		userID, req.IterationNumber,
	).Scan(&o.ID, &o.UserID, &o.IterationNumber, &o.StartDate, &o.EndDate, &o.CreatedAt, &o.UpdatedAt)
	if err != nil {
		jsonError(w, "Internal error", http.StatusInternalServerError)
		return
	}

	jsonOK(w, map[string]interface{}{"override": o})
}

func handleDeleteIterationOverride(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	iterationNumber := r.URL.Query().Get("iteration_number")
	if iterationNumber == "" {
		jsonError(w, "iteration_number query parameter is required", http.StatusBadRequest)
		return
	}

	result, err := db.Exec("DELETE FROM iteration_overrides WHERE user_id = ? AND iteration_number = ?", userID, iterationNumber)
	if err != nil {
		jsonError(w, "Failed to delete override", http.StatusInternalServerError)
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		jsonError(w, "Override not found", http.StatusNotFound)
		return
	}

	jsonOK(w, map[string]string{"message": "Override deleted"})
}
