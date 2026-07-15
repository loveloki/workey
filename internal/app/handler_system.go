package app

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"os"
	"os/exec"
	"strings"
)

// 系统信息和历史日期范围 handler

func handleSystemVersion(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var v VersionResponse
	data, err := os.ReadFile("version.json")
	if err == nil {
		if err := json.Unmarshal(data, &v); err == nil && v.Commit != "" {
			jsonOK(w, v)
			return
		}
	}

	// 使用换行分隔各字段，避免 commit message 中的特殊字符导致 JSON 注入
	cmd := exec.Command("git", "log", "-1", "--format=%h%n%cd%n%s", "--date=short")
	out, err := cmd.Output()
	if err == nil {
		parts := strings.SplitN(strings.TrimSpace(string(out)), "\n", 3)
		if len(parts) == 3 {
			jsonOK(w, VersionResponse{Commit: parts[0], Date: parts[1], Content: parts[2]})
			return
		}
	}

	jsonOK(w, VersionResponse{Commit: "unknown", Date: "unknown", Content: "unknown"})
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
			SELECT date(updated_at) AS d FROM todos WHERE user_id = ? AND done = 1
			UNION ALL
			SELECT occurred_on AS d FROM ticket_issues WHERE user_id = ?
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
