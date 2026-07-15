package app

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const (
	ticketCauseCode      = "code"
	ticketCauseOperation = "operation"
)

type ticketIssueRequest struct {
	TicketNo           string `json:"ticket_no"`
	TicketTitle        string `json:"ticket_title"`
	TicketURL          string `json:"ticket_url"`
	OccurredOn         string `json:"occurred_on"`
	CauseType          string `json:"cause_type"`
	ProblemDescription string `json:"problem_description"`
	CauseDetail        string `json:"cause_detail"`
	Resolution         string `json:"resolution"`
}

func handleTicketIssues(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		handleTicketIssueList(w, r)
	case http.MethodPost:
		handleTicketIssueCreate(w, r)
	case http.MethodPut:
		handleTicketIssueUpdate(w, r)
	case http.MethodDelete:
		handleTicketIssueDelete(w, r)
	default:
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func handleTicketIssueCreate(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	var req ticketIssueRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if message := validateTicketIssueRequest(&req); message != "" {
		jsonError(w, message, http.StatusBadRequest)
		return
	}

	now := nowDatetime()
	result, err := db.Exec(`
		INSERT INTO ticket_issues (
			user_id, ticket_no, ticket_title, ticket_url, occurred_on, cause_type,
			problem_description, cause_detail, resolution, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		userID, req.TicketNo, req.TicketTitle, req.TicketURL, req.OccurredOn,
		req.CauseType, req.ProblemDescription, req.CauseDetail, req.Resolution, now, now,
	)
	if err != nil {
		jsonError(w, "Failed to create ticket issue", http.StatusInternalServerError)
		return
	}
	id, _ := result.LastInsertId()
	issue, err := getTicketIssue(userID, id)
	if err != nil {
		jsonError(w, "Failed to load ticket issue", http.StatusInternalServerError)
		return
	}
	jsonOK(w, TicketIssueResponse{TicketIssue: issue})
}

func handleTicketIssueUpdate(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	id, ok := ticketIssueID(w, r)
	if !ok {
		return
	}

	var req ticketIssueRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if message := validateTicketIssueRequest(&req); message != "" {
		jsonError(w, message, http.StatusBadRequest)
		return
	}

	result, err := db.Exec(`
		UPDATE ticket_issues SET
			ticket_no = ?, ticket_title = ?, ticket_url = ?, occurred_on = ?, cause_type = ?,
			problem_description = ?, cause_detail = ?, resolution = ?, updated_at = ?
		WHERE id = ? AND user_id = ?`,
		req.TicketNo, req.TicketTitle, req.TicketURL, req.OccurredOn, req.CauseType,
		req.ProblemDescription, req.CauseDetail, req.Resolution, nowDatetime(), id, userID,
	)
	if err != nil {
		jsonError(w, "Failed to update ticket issue", http.StatusInternalServerError)
		return
	}
	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		jsonError(w, "Ticket issue not found", http.StatusNotFound)
		return
	}
	issue, err := getTicketIssue(userID, id)
	if err != nil {
		jsonError(w, "Failed to load ticket issue", http.StatusInternalServerError)
		return
	}
	jsonOK(w, TicketIssueResponse{TicketIssue: issue})
}

func handleTicketIssueDelete(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	id, ok := ticketIssueID(w, r)
	if !ok {
		return
	}
	result, err := db.Exec("DELETE FROM ticket_issues WHERE id = ? AND user_id = ?", id, userID)
	if err != nil {
		jsonError(w, "Failed to delete ticket issue", http.StatusInternalServerError)
		return
	}
	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		jsonError(w, "Ticket issue not found", http.StatusNotFound)
		return
	}
	jsonOK(w, MessageResponse{Message: "Ticket issue deleted"})
}

func handleTicketIssueList(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	where, args, ok := ticketIssueFilters(w, r, userID, true)
	if !ok {
		return
	}

	rows, err := db.Query(`
		SELECT id, user_id, ticket_no, ticket_title, ticket_url, occurred_on, cause_type,
			problem_description, cause_detail, resolution, created_at, updated_at
		FROM ticket_issues WHERE `+where+`
		ORDER BY occurred_on DESC, updated_at DESC, id DESC`, args...)
	if err != nil {
		jsonError(w, "Failed to list ticket issues", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	issues := []TicketIssue{}
	for rows.Next() {
		issue, err := scanTicketIssue(rows)
		if err != nil {
			jsonError(w, "Failed to read ticket issues", http.StatusInternalServerError)
			return
		}
		issues = append(issues, issue)
	}
	if err := rows.Err(); err != nil {
		jsonError(w, "Failed to read ticket issues", http.StatusInternalServerError)
		return
	}
	jsonOK(w, TicketIssueListResponse{TicketIssues: issues})
}

func handleTicketIssueStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	userID := getUserID(r)
	where, args, ok := ticketIssueFilters(w, r, userID, false)
	if !ok {
		return
	}

	var stats TicketIssueStatsResponse
	err := db.QueryRow(`
		SELECT COUNT(*),
			COALESCE(SUM(CASE WHEN cause_type = 'code' THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN cause_type = 'operation' THEN 1 ELSE 0 END), 0)
		FROM ticket_issues WHERE `+where, args...).Scan(
		&stats.TotalCount, &stats.CodeCount, &stats.OperationCount,
	)
	if err != nil {
		jsonError(w, "Failed to calculate ticket issue stats", http.StatusInternalServerError)
		return
	}
	jsonOK(w, stats)
}

func validateTicketIssueRequest(req *ticketIssueRequest) string {
	req.TicketNo = strings.TrimSpace(req.TicketNo)
	req.TicketTitle = strings.TrimSpace(req.TicketTitle)
	req.TicketURL = strings.TrimSpace(req.TicketURL)
	req.OccurredOn = strings.TrimSpace(req.OccurredOn)
	req.CauseType = strings.TrimSpace(req.CauseType)
	req.ProblemDescription = strings.TrimSpace(req.ProblemDescription)
	req.CauseDetail = strings.TrimSpace(req.CauseDetail)
	req.Resolution = strings.TrimSpace(req.Resolution)

	if req.TicketNo == "" {
		return "Ticket number is required"
	}
	if !validDate(req.OccurredOn) {
		return "Occurred date must use YYYY-MM-DD format"
	}
	if req.CauseType != ticketCauseCode && req.CauseType != ticketCauseOperation {
		return "Cause type must be code or operation"
	}
	if req.ProblemDescription == "" {
		return "Problem description is required"
	}
	if req.CauseDetail == "" {
		return "Cause detail is required"
	}
	return ""
}

func ticketIssueFilters(w http.ResponseWriter, r *http.Request, userID int64, includeCause bool) (string, []any, bool) {
	start := strings.TrimSpace(r.URL.Query().Get("start"))
	end := strings.TrimSpace(r.URL.Query().Get("end"))
	causeType := strings.TrimSpace(r.URL.Query().Get("cause_type"))
	keyword := strings.TrimSpace(r.URL.Query().Get("q"))

	if start != "" && !validDate(start) {
		jsonError(w, "start must use YYYY-MM-DD format", http.StatusBadRequest)
		return "", nil, false
	}
	if end != "" && !validDate(end) {
		jsonError(w, "end must use YYYY-MM-DD format", http.StatusBadRequest)
		return "", nil, false
	}
	if start != "" && end != "" && start > end {
		jsonError(w, "start must not be after end", http.StatusBadRequest)
		return "", nil, false
	}
	if includeCause && causeType != "" && causeType != ticketCauseCode && causeType != ticketCauseOperation {
		jsonError(w, "cause_type must be code or operation", http.StatusBadRequest)
		return "", nil, false
	}

	parts := []string{"user_id = ?"}
	args := []any{userID}
	if start != "" {
		parts = append(parts, "occurred_on >= ?")
		args = append(args, start)
	}
	if end != "" {
		parts = append(parts, "occurred_on <= ?")
		args = append(args, end)
	}
	if includeCause && causeType != "" {
		parts = append(parts, "cause_type = ?")
		args = append(args, causeType)
	}
	if keyword != "" {
		parts = append(parts, `(ticket_no LIKE ? OR ticket_title LIKE ? OR problem_description LIKE ? OR cause_detail LIKE ? OR resolution LIKE ?)`)
		pattern := "%" + keyword + "%"
		args = append(args, pattern, pattern, pattern, pattern, pattern)
	}
	return strings.Join(parts, " AND "), args, true
}

func ticketIssueID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	idText := r.URL.Query().Get("id")
	id, err := strconv.ParseInt(idText, 10, 64)
	if err != nil || id <= 0 {
		jsonError(w, "valid id query parameter is required", http.StatusBadRequest)
		return 0, false
	}
	return id, true
}

func validDate(value string) bool {
	if len(value) != len("2006-01-02") {
		return false
	}
	parsed, err := time.Parse("2006-01-02", value)
	return err == nil && parsed.Format("2006-01-02") == value
}

func getTicketIssue(userID, id int64) (TicketIssue, error) {
	row := db.QueryRow(`
		SELECT id, user_id, ticket_no, ticket_title, ticket_url, occurred_on, cause_type,
			problem_description, cause_detail, resolution, created_at, updated_at
		FROM ticket_issues WHERE id = ? AND user_id = ?`, id, userID)
	issue, err := scanTicketIssue(row)
	if errors.Is(err, sql.ErrNoRows) {
		return TicketIssue{}, sql.ErrNoRows
	}
	return issue, err
}

type ticketIssueScanner interface {
	Scan(dest ...any) error
}

func scanTicketIssue(scanner ticketIssueScanner) (TicketIssue, error) {
	var issue TicketIssue
	err := scanner.Scan(
		&issue.ID, &issue.UserID, &issue.TicketNo, &issue.TicketTitle, &issue.TicketURL,
		&issue.OccurredOn, &issue.CauseType, &issue.ProblemDescription, &issue.CauseDetail,
		&issue.Resolution, &issue.CreatedAt, &issue.UpdatedAt,
	)
	return issue, err
}
