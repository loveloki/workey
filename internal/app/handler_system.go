package app

import (
	"encoding/json"
	"os"
	"os/exec"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// 系统信息和历史日期范围 handler

func handleSystemVersion(e *core.RequestEvent) error {
	var v VersionResponse
	if data, err := os.ReadFile("version.json"); err == nil {
		if err := json.Unmarshal(data, &v); err == nil && v.Commit != "" {
			return e.JSON(200, v)
		}
	}

	// 使用换行分隔各字段，避免 commit message 中的特殊字符导致 JSON 注入
	out, err := exec.Command("git", "log", "-1", "--format=%h%n%cd%n%s", "--date=short").Output()
	if err == nil {
		parts := strings.SplitN(strings.TrimSpace(string(out)), "\n", 3)
		if len(parts) == 3 {
			return e.JSON(200, VersionResponse{Commit: parts[0], Date: parts[1], Content: parts[2]})
		}
	}
	return e.JSON(200, VersionResponse{Commit: "unknown", Date: "unknown", Content: "unknown"})
}

func handleHistoryDateRange(e *core.RequestEvent) error {
	var result struct {
		Earliest *string `db:"earliest"`
		Latest   *string `db:"latest"`
	}
	// 跨 collection 聚合直接查询底层表；已完成待办按完成（最后更新）日期计入。
	err := e.App.DB().NewQuery(`
		SELECT MIN(d) AS earliest, MAX(d) AS latest FROM (
			SELECT date AS d FROM attendance WHERE user = {:user}
			UNION ALL
			SELECT date AS d FROM work_logs WHERE user = {:user}
			UNION ALL
			SELECT date(updated) AS d FROM todos WHERE user = {:user} AND done = 1
			UNION ALL
			SELECT occurred_on AS d FROM ticket_issues WHERE user = {:user}
		)`).Bind(dbx.Params{"user": e.Auth.Id}).One(&result)
	if err != nil {
		return e.InternalServerError("Internal error", err)
	}
	return e.JSON(200, VersionRangeResponse{Earliest: result.Earliest, Latest: result.Latest})
}
