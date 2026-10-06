package app

import (
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
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

func readTicketIssueRequest(e *core.RequestEvent) (ticketIssueRequest, error) {
	var req ticketIssueRequest
	if err := e.BindBody(&req); err != nil {
		return req, e.BadRequestError("Invalid request body", err)
	}
	if message := validateTicketIssueRequest(&req); message != "" {
		return req, e.BadRequestError(message, nil)
	}
	return req, nil
}

func setTicketIssueFields(record *core.Record, req ticketIssueRequest) {
	record.Set("ticket_no", req.TicketNo)
	record.Set("ticket_title", req.TicketTitle)
	record.Set("ticket_url", req.TicketURL)
	record.Set("occurred_on", req.OccurredOn)
	record.Set("cause_type", req.CauseType)
	record.Set("problem_description", req.ProblemDescription)
	record.Set("cause_detail", req.CauseDetail)
	record.Set("resolution", req.Resolution)
}

func handleTicketIssueCreate(e *core.RequestEvent) error {
	req, err := readTicketIssueRequest(e)
	if err != nil {
		return err
	}
	record, err := newUserRecord(e.App, ticketIssueCollection, e.Auth.Id)
	if err != nil {
		return e.InternalServerError("Failed to create ticket issue", err)
	}
	setTicketIssueFields(record, req)
	if err := e.App.Save(record); err != nil {
		return e.InternalServerError("Failed to create ticket issue", err)
	}
	return e.JSON(200, TicketIssueResponse{TicketIssue: ticketIssueFromRecord(record)})
}

func handleTicketIssueUpdate(e *core.RequestEvent) error {
	id := e.Request.URL.Query().Get("id")
	if id == "" {
		return e.BadRequestError("valid id query parameter is required", nil)
	}
	req, err := readTicketIssueRequest(e)
	if err != nil {
		return err
	}
	record, err := requireOwnedRecord(e, ticketIssueCollection, id, "Ticket issue")
	if err != nil {
		return err
	}
	setTicketIssueFields(record, req)
	if err := e.App.Save(record); err != nil {
		return e.InternalServerError("Failed to update ticket issue", err)
	}
	return e.JSON(200, TicketIssueResponse{TicketIssue: ticketIssueFromRecord(record)})
}

func handleTicketIssueDelete(e *core.RequestEvent) error {
	return deleteOwnedRecord(e, ticketIssueCollection, "Ticket issue")
}

func handleTicketIssueList(e *core.RequestEvent) error {
	records, err := findTicketIssues(e, true)
	if err != nil {
		return err
	}
	return e.JSON(200, TicketIssueListResponse{TicketIssues: mapRecords(records, ticketIssueFromRecord)})
}

func handleTicketIssueStats(e *core.RequestEvent) error {
	records, err := findTicketIssues(e, false)
	if err != nil {
		return err
	}
	stats := TicketIssueStatsResponse{TotalCount: int64(len(records))}
	for _, record := range records {
		switch record.GetString("cause_type") {
		case ticketCauseCode:
			stats.CodeCount++
		case ticketCauseOperation:
			stats.OperationCount++
		}
	}
	return e.JSON(200, stats)
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

// findTicketIssues 按查询参数过滤当前用户的工单问题，关键字使用 PocketBase 的 ~（LIKE）运算符。
func findTicketIssues(e *core.RequestEvent, includeCause bool) ([]*core.Record, error) {
	query := e.Request.URL.Query()
	start := strings.TrimSpace(query.Get("start"))
	end := strings.TrimSpace(query.Get("end"))
	causeType := strings.TrimSpace(query.Get("cause_type"))
	keyword := strings.TrimSpace(query.Get("q"))

	if start != "" && !validDate(start) {
		return nil, e.BadRequestError("start must use YYYY-MM-DD format", nil)
	}
	if end != "" && !validDate(end) {
		return nil, e.BadRequestError("end must use YYYY-MM-DD format", nil)
	}
	if start != "" && end != "" && start > end {
		return nil, e.BadRequestError("start must not be after end", nil)
	}
	if includeCause && causeType != "" && causeType != ticketCauseCode && causeType != ticketCauseOperation {
		return nil, e.BadRequestError("cause_type must be code or operation", nil)
	}

	parts := []string{}
	params := dbx.Params{"user": e.Auth.Id}
	if start != "" {
		parts = append(parts, "occurred_on >= {:start}")
		params["start"] = start
	}
	if end != "" {
		parts = append(parts, "occurred_on <= {:end}")
		params["end"] = end
	}
	if includeCause && causeType != "" {
		parts = append(parts, "cause_type = {:cause}")
		params["cause"] = causeType
	}
	if keyword != "" {
		parts = append(parts, "(ticket_no ~ {:q} || ticket_title ~ {:q} || problem_description ~ {:q} || cause_detail ~ {:q} || resolution ~ {:q})")
		// 转义 %，让 PocketBase 按普通文本做包含匹配而不是当作通配模式。
		params["q"] = strings.ReplaceAll(keyword, "%", `\%`)
	}
	records, err := findUserRecords(e.App, ticketIssueCollection, strings.Join(parts, " && "), "-occurred_on,-updated", params)
	if err != nil {
		return nil, e.InternalServerError("Failed to list ticket issues", err)
	}
	return records, nil
}
