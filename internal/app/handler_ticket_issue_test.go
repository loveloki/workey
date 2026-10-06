package app

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func createTicketIssueForTest(t *testing.T, userID string, body string) TicketIssue {
	t.Helper()
	req := createAuthenticatedRequest(t, http.MethodPost, "/api/workey/ticket-issues", body, userID)
	rr := httptest.NewRecorder()
	serveTest(rr, req)
	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())
	var resp TicketIssueResponse
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	return resp.TicketIssue
}

func TestHandleTicketIssuesCRUD(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "ticket-user", "password123")
	otherUserID := createTestUser(t, "ticket-other", "password123")
	issue := createTicketIssueForTest(t, userID, `{
		"ticket_no":"WO-1001",
		"ticket_title":"登录失败",
		"ticket_url":"https://example.com/tickets/1001",
		"occurred_on":"2025-01-10",
		"cause_type":"code",
		"problem_description":"部分用户无法登录",
		"cause_detail":"空指针导致认证中断",
		"resolution":"补充判空并增加回归测试"
	}`)

	assert.NotZero(t, issue.ID)
	assert.Equal(t, "WO-1001", issue.TicketNo)
	assert.Equal(t, ticketCauseCode, issue.CauseType)

	t.Run("获取列表", func(t *testing.T) {
		req := createAuthenticatedRequest(t, http.MethodGet, "/api/workey/ticket-issues", "", userID)
		rr := httptest.NewRecorder()
		serveTest(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		var resp TicketIssueListResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		require.Len(t, resp.TicketIssues, 1)
		assert.Equal(t, "登录失败", resp.TicketIssues[0].TicketTitle)
	})

	t.Run("更新记录", func(t *testing.T) {
		body := `{
			"ticket_no":"WO-1001","ticket_title":"登录失败","ticket_url":"",
			"occurred_on":"2025-01-11","cause_type":"operation",
			"problem_description":"配置后无法登录","cause_detail":"操作时遗漏配置项",
			"resolution":"补充操作手册"
		}`
		req := createAuthenticatedRequest(t, http.MethodPut, "/api/workey/ticket-issues?id="+string(issue.ID), body, userID)
		rr := httptest.NewRecorder()
		serveTest(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code, rr.Body.String())
		var resp TicketIssueResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.Equal(t, ticketCauseOperation, resp.TicketIssue.CauseType)
		assert.Equal(t, "补充操作手册", resp.TicketIssue.Resolution)
	})

	t.Run("其他用户不能更新", func(t *testing.T) {
		body := `{
			"ticket_no":"WO-1001","occurred_on":"2025-01-11","cause_type":"code",
			"problem_description":"问题","cause_detail":"根因"
		}`
		req := createAuthenticatedRequest(t, http.MethodPut, "/api/workey/ticket-issues?id="+string(issue.ID), body, otherUserID)
		rr := httptest.NewRecorder()
		serveTest(rr, req)
		assert.Equal(t, http.StatusNotFound, rr.Code)
	})

	t.Run("其他用户不能删除", func(t *testing.T) {
		req := createAuthenticatedRequest(t, http.MethodDelete, "/api/workey/ticket-issues?id="+string(issue.ID), "", otherUserID)
		rr := httptest.NewRecorder()
		serveTest(rr, req)
		assert.Equal(t, http.StatusNotFound, rr.Code)
	})

	t.Run("删除记录", func(t *testing.T) {
		req := createAuthenticatedRequest(t, http.MethodDelete, "/api/workey/ticket-issues?id="+string(issue.ID), "", userID)
		rr := httptest.NewRecorder()
		serveTest(rr, req)
		assert.Equal(t, http.StatusOK, rr.Code)
	})
}

func TestHandleTicketIssuesFiltersAndStats(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := createTestUser(t, "ticket-stats", "password123")

	createTicketIssueForTest(t, userID, `{
		"ticket_no":"WO-CODE","ticket_title":"接口异常","occurred_on":"2025-02-01",
		"cause_type":"code","problem_description":"接口返回 500","cause_detail":"代码边界未处理"
	}`)
	createTicketIssueForTest(t, userID, `{
		"ticket_no":"WO-OPS","ticket_title":"发布遗漏","occurred_on":"2025-02-15",
		"cause_type":"operation","problem_description":"配置未生效","cause_detail":"操作步骤遗漏","resolution":"更新发布清单"
	}`)
	createTicketIssueForTest(t, userID, `{
		"ticket_no":"WO-OLD","occurred_on":"2024-12-31",
		"cause_type":"code","problem_description":"旧问题","cause_detail":"旧代码"
	}`)

	t.Run("按日期、分类和关键词过滤", func(t *testing.T) {
		req := createAuthenticatedRequest(t, http.MethodGet,
			"/api/workey/ticket-issues?start=2025-02-01&end=2025-02-28&cause_type=operation&q=%E5%8F%91%E5%B8%83", "", userID)
		rr := httptest.NewRecorder()
		serveTest(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		var resp TicketIssueListResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		require.Len(t, resp.TicketIssues, 1)
		assert.Equal(t, "WO-OPS", resp.TicketIssues[0].TicketNo)
	})

	t.Run("统计日期范围内原因", func(t *testing.T) {
		req := createAuthenticatedRequest(t, http.MethodGet,
			"/api/workey/ticket-issues/stats?start=2025-02-01&end=2025-02-28", "", userID)
		rr := httptest.NewRecorder()
		serveTest(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		var resp TicketIssueStatsResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.Equal(t, int64(2), resp.TotalCount)
		assert.Equal(t, int64(1), resp.CodeCount)
		assert.Equal(t, int64(1), resp.OperationCount)
	})

	t.Run("统计支持关键词", func(t *testing.T) {
		req := createAuthenticatedRequest(t, http.MethodGet, "/api/workey/ticket-issues/stats?q=%E6%93%8D%E4%BD%9C", "", userID)
		rr := httptest.NewRecorder()
		serveTest(rr, req)
		var resp TicketIssueStatsResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.Equal(t, int64(1), resp.TotalCount)
		assert.Equal(t, int64(1), resp.OperationCount)
	})
}

func TestHandleTicketIssuesValidation(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := createTestUser(t, "ticket-validation", "password123")

	tests := []struct {
		name string
		body string
	}{
		{"缺少工单编号", `{"occurred_on":"2025-01-01","cause_type":"code","problem_description":"问题","cause_detail":"原因"}`},
		{"日期无效", `{"ticket_no":"WO-1","occurred_on":"2025-02-30","cause_type":"code","problem_description":"问题","cause_detail":"原因"}`},
		{"分类无效", `{"ticket_no":"WO-1","occurred_on":"2025-01-01","cause_type":"other","problem_description":"问题","cause_detail":"原因"}`},
		{"缺少问题描述", `{"ticket_no":"WO-1","occurred_on":"2025-01-01","cause_type":"code","cause_detail":"原因"}`},
		{"缺少根因", `{"ticket_no":"WO-1","occurred_on":"2025-01-01","cause_type":"code","problem_description":"问题"}`},
		{"JSON 无效", `bad json`},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := createAuthenticatedRequest(t, http.MethodPost, "/api/workey/ticket-issues", tc.body, userID)
			rr := httptest.NewRecorder()
			serveTest(rr, req)
			assert.Equal(t, http.StatusBadRequest, rr.Code)
		})
	}

	t.Run("查询起止日期倒置", func(t *testing.T) {
		req := createAuthenticatedRequest(t, http.MethodGet, "/api/workey/ticket-issues?start=2025-02-01&end=2025-01-01", "", userID)
		rr := httptest.NewRecorder()
		serveTest(rr, req)
		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("缺少有效 ID", func(t *testing.T) {
		req := createAuthenticatedRequest(t, http.MethodDelete, "/api/workey/ticket-issues?id=", "", userID)
		rr := httptest.NewRecorder()
		serveTest(rr, req)
		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("不支持的方法", func(t *testing.T) {
		req := createAuthenticatedRequest(t, http.MethodPatch, "/api/workey/ticket-issues", "", userID)
		rr := httptest.NewRecorder()
		serveTest(rr, req)
		assert.Equal(t, http.StatusNotFound, rr.Code)
	})

	t.Run("统计不支持 POST", func(t *testing.T) {
		req := createAuthenticatedRequest(t, http.MethodPost, "/api/workey/ticket-issues/stats", "", userID)
		rr := httptest.NewRecorder()
		serveTest(rr, req)
		assert.Equal(t, http.StatusNotFound, rr.Code)
	})
}
