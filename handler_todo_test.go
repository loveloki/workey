package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestHandleTodos_CRUD(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "todouser", "password123")

	var createdTodoID int64

	t.Run("创建待办", func(t *testing.T) {
		body := `{"content":"完成单元测试","url":"https://example.com"}`
		req := createAuthenticatedRequest(t, "POST", "/api/todos", body, userID)
		rr := httptest.NewRecorder()

		handleTodos(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var resp TodoResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.Equal(t, "完成单元测试", resp.Todo.Content)
		assert.Equal(t, "https://example.com", resp.Todo.URL)
		assert.Equal(t, false, resp.Todo.Done)
		createdTodoID = resp.Todo.ID
	})

	t.Run("获取待办列表", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "GET", "/api/todos", "", userID)
		rr := httptest.NewRecorder()

		handleTodos(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var resp TodoListResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.Len(t, resp.Todos, 1)
	})

	t.Run("更新待办为已完成", func(t *testing.T) {
		body := `{"done":true}`
		url := "/api/todos?id=" + strconv.FormatInt(createdTodoID, 10)
		req := createAuthenticatedRequest(t, "PUT", url, body, userID)
		rr := httptest.NewRecorder()

		handleTodos(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var resp TodoResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.Equal(t, true, resp.Todo.Done)
	})

	t.Run("删除待办", func(t *testing.T) {
		url := "/api/todos?id=" + strconv.FormatInt(createdTodoID, 10)
		req := createAuthenticatedRequest(t, "DELETE", url, "", userID)
		rr := httptest.NewRecorder()

		handleTodos(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
	})

	t.Run("删除不存在的待办", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "DELETE", "/api/todos?id=99999", "", userID)
		rr := httptest.NewRecorder()

		handleTodos(rr, req)

		assert.Equal(t, http.StatusNotFound, rr.Code)
	})
}

func TestHandleCreateTodo_Validation(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "valuser", "password123")

	t.Run("内容和 URL 都为空应报错", func(t *testing.T) {
		body := `{"content":"","url":""}`
		req := createAuthenticatedRequest(t, "POST", "/api/todos", body, userID)
		rr := httptest.NewRecorder()

		handleTodos(rr, req)

		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("无效 JSON 请求体", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "POST", "/api/todos", "bad", userID)
		rr := httptest.NewRecorder()

		handleTodos(rr, req)

		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("PATCH 方法不允许", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "PATCH", "/api/todos", "", userID)
		rr := httptest.NewRecorder()

		handleTodos(rr, req)

		assert.Equal(t, http.StatusMethodNotAllowed, rr.Code)
	})
}

func TestHandleUpdateTodo_Details(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "updtodo", "password123")

	// 创建待办
	body := `{"content":"原内容","url":"https://old.url"}`
	req := createAuthenticatedRequest(t, "POST", "/api/todos", body, userID)
	rr := httptest.NewRecorder()
	handleTodos(rr, req)
	require.Equal(t, http.StatusOK, rr.Code)

	var createResp TodoResponse
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &createResp))
	todoID := strconv.FormatInt(createResp.Todo.ID, 10)

	t.Run("只更新内容", func(t *testing.T) {
		body := `{"content":"新内容"}`
		req := createAuthenticatedRequest(t, "PUT", "/api/todos?id="+todoID, body, userID)
		rr := httptest.NewRecorder()

		handleTodos(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		var resp TodoResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.Equal(t, "新内容", resp.Todo.Content)
		assert.Equal(t, "https://old.url", resp.Todo.URL)
	})

	t.Run("只更新 URL", func(t *testing.T) {
		body := `{"url":"https://new.url"}`
		req := createAuthenticatedRequest(t, "PUT", "/api/todos?id="+todoID, body, userID)
		rr := httptest.NewRecorder()

		handleTodos(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
	})

	t.Run("更新不存在的待办", func(t *testing.T) {
		body := `{"content":"x"}`
		req := createAuthenticatedRequest(t, "PUT", "/api/todos?id=99999", body, userID)
		rr := httptest.NewRecorder()

		handleTodos(rr, req)

		assert.Equal(t, http.StatusNotFound, rr.Code)
	})

	t.Run("缺少 id 参数", func(t *testing.T) {
		body := `{"content":"x"}`
		req := createAuthenticatedRequest(t, "PUT", "/api/todos", body, userID)
		rr := httptest.NewRecorder()

		handleTodos(rr, req)

		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("无效 JSON 更新", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "PUT", "/api/todos?id="+todoID, "bad", userID)
		rr := httptest.NewRecorder()

		handleTodos(rr, req)

		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("缺少 id 删除", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "DELETE", "/api/todos", "", userID)
		rr := httptest.NewRecorder()

		handleTodos(rr, req)

		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})
}

func TestHandleCreatedTodayTodos(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "todaytodo", "password123")

	// 创建一个待办
	body := `{"content":"今天的任务"}`
	req := createAuthenticatedRequest(t, "POST", "/api/todos", body, userID)
	rr := httptest.NewRecorder()
	handleTodos(rr, req)
	require.Equal(t, http.StatusOK, rr.Code)

	t.Run("获取今日创建的待办", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "GET", "/api/todos/created-today", "", userID)
		rr := httptest.NewRecorder()

		handleCreatedTodayTodos(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var resp TodoListResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.Len(t, resp.Todos, 1)
	})

	t.Run("POST 方法不允许", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "POST", "/api/todos/created-today", "", userID)
		rr := httptest.NewRecorder()

		handleCreatedTodayTodos(rr, req)

		assert.Equal(t, http.StatusMethodNotAllowed, rr.Code)
	})
}

func TestHandleCompletedTodayTodos_MethodNotAllowed(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "compma", "password123")

	req := createAuthenticatedRequest(t, "POST", "/api/todos/completed-today", "", userID)
	rr := httptest.NewRecorder()

	handleCompletedTodayTodos(rr, req)

	assert.Equal(t, http.StatusMethodNotAllowed, rr.Code)
}

func TestHandleCompletedTodayTodos(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "comptodo", "password123")

	// 创建并完成一个待办
	body := `{"content":"要完成的任务"}`
	req := createAuthenticatedRequest(t, "POST", "/api/todos", body, userID)
	rr := httptest.NewRecorder()
	handleTodos(rr, req)
	require.Equal(t, http.StatusOK, rr.Code)

	var createResp TodoResponse
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &createResp))
	todoIDStr := strconv.FormatInt(createResp.Todo.ID, 10)

	// 标记为完成
	body = `{"done":true}`
	req = createAuthenticatedRequest(t, "PUT", "/api/todos?id="+todoIDStr, body, userID)
	rr = httptest.NewRecorder()
	handleTodos(rr, req)
	require.Equal(t, http.StatusOK, rr.Code)

	t.Run("获取今日完成的待办", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "GET", "/api/todos/completed-today", "", userID)
		rr := httptest.NewRecorder()

		handleCompletedTodayTodos(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var resp TodoListResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.Len(t, resp.Todos, 1)
	})
}

func TestHandleCompletedRangeTodos(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "rangetodo", "password123")

	t.Run("缺少参数返回错误", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "GET", "/api/todos/completed-range", "", userID)
		rr := httptest.NewRecorder()

		handleCompletedRangeTodos(rr, req)

		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("有数据时查询范围内完成的待办", func(t *testing.T) {
		// 创建并完成一个待办
		body := `{"content":"范围任务"}`
		req := createAuthenticatedRequest(t, "POST", "/api/todos", body, userID)
		rr := httptest.NewRecorder()
		handleTodos(rr, req)
		require.Equal(t, http.StatusOK, rr.Code)

		var createResp TodoResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &createResp))
		todoIDStr := strconv.FormatInt(createResp.Todo.ID, 10)

		req = createAuthenticatedRequest(t, "PUT", "/api/todos?id="+todoIDStr, `{"done":true}`, userID)
		rr = httptest.NewRecorder()
		handleTodos(rr, req)
		require.Equal(t, http.StatusOK, rr.Code)

		// 查询
		req = createAuthenticatedRequest(t, "GET", "/api/todos/completed-range?start=2024-01-01&end=2099-12-31", "", userID)
		rr = httptest.NewRecorder()

		handleCompletedRangeTodos(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var listResp TodoListResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &listResp))
		assert.Len(t, listResp.Todos, 1)
	})

	t.Run("POST 方法不允许", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "POST", "/api/todos/completed-range", "", userID)
		rr := httptest.NewRecorder()

		handleCompletedRangeTodos(rr, req)

		assert.Equal(t, http.StatusMethodNotAllowed, rr.Code)
	})
}

func TestHandleGetTodosAll(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "alltodo", "password123")

	// 创建并完成一个待办
	body := `{"content":"已完成"}`
	req := createAuthenticatedRequest(t, "POST", "/api/todos", body, userID)
	rr := httptest.NewRecorder()
	handleTodos(rr, req)
	require.Equal(t, http.StatusOK, rr.Code)

	var createResp TodoResponse
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &createResp))
	todoIDStr := strconv.FormatInt(createResp.Todo.ID, 10)

	req = createAuthenticatedRequest(t, "PUT", "/api/todos?id="+todoIDStr, `{"done":true}`, userID)
	rr = httptest.NewRecorder()
	handleTodos(rr, req)
	require.Equal(t, http.StatusOK, rr.Code)

	// 创建一个未完成的
	body = `{"content":"未完成"}`
	req = createAuthenticatedRequest(t, "POST", "/api/todos", body, userID)
	rr = httptest.NewRecorder()
	handleTodos(rr, req)
	require.Equal(t, http.StatusOK, rr.Code)

	t.Run("默认只返回未完成", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "GET", "/api/todos", "", userID)
		rr := httptest.NewRecorder()

		handleTodos(rr, req)

		var resp TodoListResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.Len(t, resp.Todos, 1)
	})

	t.Run("all=1 返回所有", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "GET", "/api/todos?all=1", "", userID)
		rr := httptest.NewRecorder()

		handleTodos(rr, req)

		var resp TodoListResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.Len(t, resp.Todos, 2)
	})
}
