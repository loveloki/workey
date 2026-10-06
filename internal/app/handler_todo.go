package app

import (
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// 待办事项 handler

func todoList(e *core.RequestEvent, filter, sort string, params dbx.Params) error {
	params["user"] = e.Auth.Id
	records, err := findUserRecords(e.App, todoCollection, filter, sort, params)
	if err != nil {
		return e.InternalServerError("Internal error", err)
	}
	return e.JSON(200, TodoListResponse{Todos: mapRecords(records, todoFromRecord)})
}

// todayRange 返回今天（UTC）的 [start, end) datetime 区间参数。
func todayRange() dbx.Params {
	end, _ := nextDayStart(today())
	return dbx.Params{"start": dayStart(today()), "end": end}
}

func handleGetTodos(e *core.RequestEvent) error {
	if e.Request.URL.Query().Get("all") == "1" {
		return todoList(e, "", "-created,-@rowid", dbx.Params{})
	}
	return todoList(e, "done = false", "-created,-@rowid", dbx.Params{})
}

func handleCreatedTodayTodos(e *core.RequestEvent) error {
	return todoList(e, "created >= {:start} && created < {:end}", "-created,-@rowid", todayRange())
}

func handleCompletedTodayTodos(e *core.RequestEvent) error {
	return todoList(e, "done = true && updated >= {:start} && updated < {:end}", "-updated,-@rowid", todayRange())
}

func handleCompletedRangeTodos(e *core.RequestEvent) error {
	start := e.Request.URL.Query().Get("start")
	end := e.Request.URL.Query().Get("end")
	if start == "" || end == "" {
		return e.BadRequestError("start and end required", nil)
	}
	if !validDate(start) || !validDate(end) {
		return e.BadRequestError("start and end must be in YYYY-MM-DD format", nil)
	}
	endExclusive, _ := nextDayStart(end)
	return todoList(e, "done = true && updated >= {:start} && updated < {:end}", "-updated,-@rowid",
		dbx.Params{"start": dayStart(start), "end": endExclusive})
}

func handleCreateTodo(e *core.RequestEvent) error {
	var req struct {
		Content string `json:"content"`
		URL     string `json:"url"`
	}
	if err := e.BindBody(&req); err != nil {
		return e.BadRequestError("Invalid request body", err)
	}
	if strings.TrimSpace(req.Content) == "" && strings.TrimSpace(req.URL) == "" {
		return e.BadRequestError("Content or URL is required", nil)
	}
	record, err := newUserRecord(e.App, todoCollection, e.Auth.Id)
	if err != nil {
		return e.InternalServerError("Failed to create todo", err)
	}
	record.Set("content", req.Content)
	record.Set("url", req.URL)
	if err := e.App.Save(record); err != nil {
		return e.InternalServerError("Failed to create todo", err)
	}
	return e.JSON(200, TodoResponse{Todo: todoFromRecord(record)})
}

func handleUpdateTodo(e *core.RequestEvent) error {
	id := e.Request.URL.Query().Get("id")
	if id == "" {
		return e.BadRequestError("id query parameter is required", nil)
	}
	var req struct {
		Content *string `json:"content"`
		URL     *string `json:"url"`
		Done    *bool   `json:"done"`
	}
	if err := e.BindBody(&req); err != nil {
		return e.BadRequestError("Invalid request body", err)
	}
	record, err := requireOwnedRecord(e, todoCollection, id, "Todo")
	if err != nil {
		return err
	}
	if req.Content != nil {
		record.Set("content", *req.Content)
	}
	if req.URL != nil {
		record.Set("url", *req.URL)
	}
	if req.Done != nil {
		record.Set("done", *req.Done)
	}
	if err := e.App.Save(record); err != nil {
		return e.InternalServerError("Failed to update todo", err)
	}
	return e.JSON(200, TodoResponse{Todo: todoFromRecord(record)})
}

func handleDeleteTodo(e *core.RequestEvent) error {
	return deleteOwnedRecord(e, todoCollection, "Todo")
}

// deleteOwnedRecord 删除 ?id= 指定的当前用户记录。
func deleteOwnedRecord(e *core.RequestEvent, collection, label string) error {
	id := e.Request.URL.Query().Get("id")
	if id == "" {
		return e.BadRequestError("id query parameter is required", nil)
	}
	record, err := requireOwnedRecord(e, collection, id, label)
	if err != nil {
		return err
	}
	if err := e.App.Delete(record); err != nil {
		return e.InternalServerError("Failed to delete "+strings.ToLower(label), err)
	}
	return e.JSON(200, MessageResponse{Message: label + " deleted"})
}
