package main

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"os"
	"os/exec"
)

// 系统信息和历史日期范围 handler

func handleSystemVersion(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var v VersionResponse
	data, err := os.ReadFile("version.json")
	if err == nil {
		if err := json.Unmarshal(data, &v); err == nil && v.Commit != "" {
			w.Header().Set("Content-Type", "application/json")
			w.Write(data)
			return
		}
	}

	cmd := exec.Command("git", "log", "-1", "--format={\"commit\":\"%h\",\"date\":\"%cd\",\"content\":\"%s\"}", "--date=short")
	out, err := cmd.Output()
	if err == nil {
		w.Header().Set("Content-Type", "application/json")
		w.Write(out)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"commit":"unknown","date":"unknown","content":"unknown"}`))
}

func handleHistoryDateRange(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserID(r)

	var earliest, latest sql.NullString
	err := db.QueryRow(`
		SELECT MIN(d), MAX(d) FROM (
			SELECT date AS d FROM attendance WHERE user_id = ?
			UNION ALL
			SELECT date AS d FROM work_logs WHERE user_id = ?
			UNION ALL
			SELECT date AS d FROM lessons WHERE user_id = ?
			UNION ALL
			SELECT date(updated_at) AS d FROM todos WHERE user_id = ? AND done = 1
		)
	`, userID, userID, userID, userID).Scan(&earliest, &latest)
	if err != nil {
		jsonError(w, "Internal error", http.StatusInternalServerError)
		return
	}

	if !earliest.Valid {
		jsonOK(w, VersionRangeResponse{})
		return
	}

	e := earliest.String
	l := latest.String
	jsonOK(w, VersionRangeResponse{Earliest: &e, Latest: &l})
}
