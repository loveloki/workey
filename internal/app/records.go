package app

import (
	"database/sql"
	"errors"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"
)

// collection 名称，与 workey/migrations 中的定义保持一致。
const (
	accountCollection           = "workey_accounts"
	attendanceCollection        = "attendance"
	workLogCollection           = "work_logs"
	todoCollection              = "todos"
	ticketIssueCollection       = "ticket_issues"
	checklistCollection         = "checklists"
	snapshotCollection          = "checklist_snapshots"
	iterationOverrideCollection = "iteration_overrides"
	holidayCollection           = "holiday_calendar_days"
)

// API 时间统一输出为带毫秒的 UTC ISO 8601，便于浏览器解析且导出后可无损比较。
const apiTimeLayout = "2006-01-02T15:04:05.000Z07:00"

func formatTime(value types.DateTime) string {
	if value.IsZero() {
		return ""
	}
	return value.Time().UTC().Format(apiTimeLayout)
}

// dayStart 返回 YYYY-MM-DD 当天 UTC 零点的 PocketBase datetime 字符串，用于 created/updated 范围过滤。
func dayStart(date string) string {
	return date + " 00:00:00.000Z"
}

// nextDayStart 返回次日 UTC 零点，配合 dayStart 构成左闭右开区间。
func nextDayStart(date string) (string, error) {
	parsed, err := time.Parse(dateFormat, date)
	if err != nil {
		return "", err
	}
	return dayStart(parsed.AddDate(0, 0, 1).Format(dateFormat)), nil
}

func isNotFound(err error) bool {
	return errors.Is(err, sql.ErrNoRows)
}

// findOwnedRecord 按 ID 查找当前用户的记录，不属于该用户时同样视为不存在。
func findOwnedRecord(app core.App, collection, id, userID string) (*core.Record, error) {
	if id == "" {
		return nil, sql.ErrNoRows
	}
	return app.FindFirstRecordByFilter(collection, "id = {:id} && user = {:user}", dbx.Params{"id": id, "user": userID})
}

func findUserRecords(app core.App, collection, filter, sort string, params dbx.Params) ([]*core.Record, error) {
	if params == nil {
		params = dbx.Params{}
	}
	if filter == "" {
		filter = "user = {:user}"
	} else {
		filter = "user = {:user} && (" + filter + ")"
	}
	return app.FindRecordsByFilter(collection, filter, sort, 0, 0, params)
}

func newUserRecord(app core.App, collection, userID string) (*core.Record, error) {
	c, err := app.FindCachedCollectionByNameOrId(collection)
	if err != nil {
		return nil, err
	}
	record := core.NewRecord(c)
	record.Set("user", userID)
	return record, nil
}

func optionalString(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

func userFromRecord(r *core.Record) User {
	return User{ID: RecordID(r.Id), Username: r.GetString("username"), CreatedAt: formatTime(r.GetDateTime("created"))}
}

func attendanceFromRecord(r *core.Record) Attendance {
	return Attendance{
		ID: RecordID(r.Id), UserID: RecordID(r.GetString("user")), Date: r.GetString("date"),
		ClockIn: optionalString(r.GetString("clock_in")), ClockOut: optionalString(r.GetString("clock_out")),
		Status: r.GetString("status"), IsOvertime: r.GetBool("is_overtime"),
		CreatedAt: formatTime(r.GetDateTime("created")), UpdatedAt: formatTime(r.GetDateTime("updated")),
	}
}

func workLogFromRecord(r *core.Record) WorkLog {
	return WorkLog{
		ID: RecordID(r.Id), UserID: RecordID(r.GetString("user")), Date: r.GetString("date"), Content: r.GetString("content"),
		CreatedAt: formatTime(r.GetDateTime("created")), UpdatedAt: formatTime(r.GetDateTime("updated")),
	}
}

func todoFromRecord(r *core.Record) Todo {
	return Todo{
		ID: RecordID(r.Id), UserID: RecordID(r.GetString("user")), Content: r.GetString("content"),
		URL: r.GetString("url"), Done: r.GetBool("done"),
		CreatedAt: formatTime(r.GetDateTime("created")), UpdatedAt: formatTime(r.GetDateTime("updated")),
	}
}

func ticketIssueFromRecord(r *core.Record) TicketIssue {
	return TicketIssue{
		ID: RecordID(r.Id), UserID: RecordID(r.GetString("user")), TicketNo: r.GetString("ticket_no"),
		TicketTitle: r.GetString("ticket_title"), TicketURL: r.GetString("ticket_url"),
		OccurredOn: r.GetString("occurred_on"), CauseType: r.GetString("cause_type"),
		ProblemDescription: r.GetString("problem_description"), CauseDetail: r.GetString("cause_detail"),
		Resolution: r.GetString("resolution"),
		CreatedAt:  formatTime(r.GetDateTime("created")), UpdatedAt: formatTime(r.GetDateTime("updated")),
	}
}

func checklistFromRecord(r *core.Record) Checklist {
	return Checklist{
		ID: RecordID(r.Id), UserID: RecordID(r.GetString("user")), Title: r.GetString("title"),
		Items: jsonText(r, "items", "[]"), Kind: checklistKindManual,
		CreatedAt: formatTime(r.GetDateTime("created")), UpdatedAt: formatTime(r.GetDateTime("updated")),
	}
}

func snapshotFromRecord(r *core.Record) ChecklistSnapshot {
	return ChecklistSnapshot{
		ID: RecordID(r.Id), UserID: RecordID(r.GetString("user")), ChecklistID: RecordID(r.GetString("checklist")),
		Title: r.GetString("title"), ItemsHash: r.GetString("items_hash"), Data: jsonText(r, "data", "null"),
		CreatedAt: formatTime(r.GetDateTime("created")),
	}
}

func iterationOverrideFromRecord(r *core.Record) IterationOverride {
	return IterationOverride{
		ID: RecordID(r.Id), UserID: RecordID(r.GetString("user")), IterationNumber: int64(r.GetInt("iteration_number")),
		StartDate: r.GetString("start_date"), EndDate: r.GetString("end_date"),
		CreatedAt: formatTime(r.GetDateTime("created")), UpdatedAt: formatTime(r.GetDateTime("updated")),
	}
}

func holidayFromRecord(r *core.Record) HolidayCalendarDay {
	return HolidayCalendarDay{
		ID: RecordID(r.Id), UserID: RecordID(r.GetString("user")), Date: r.GetString("date"),
		IsWorkday: r.GetBool("is_workday"), Name: r.GetString("name"), Source: r.GetString("source"),
		CreatedAt: formatTime(r.GetDateTime("created")), UpdatedAt: formatTime(r.GetDateTime("updated")),
	}
}

// jsonText 返回 JSON 字段的原始文本，未设置时使用 fallback。
func jsonText(r *core.Record, field, fallback string) string {
	if raw, ok := r.Get(field).(types.JSONRaw); ok && len(raw) > 0 {
		return string(raw)
	}
	return fallback
}

func mapRecords[T any](records []*core.Record, convert func(*core.Record) T) []T {
	items := make([]T, 0, len(records))
	for _, record := range records {
		items = append(items, convert(record))
	}
	return items
}

// requireOwnedRecord 是 findOwnedRecord 的 handler 版本，直接返回 404/500 ApiError。
func requireOwnedRecord(e *core.RequestEvent, collection, id, label string) (*core.Record, error) {
	record, err := findOwnedRecord(e.App, collection, id, e.Auth.Id)
	if isNotFound(err) {
		return nil, e.NotFoundError(label+" not found", nil)
	} else if err != nil {
		return nil, e.InternalServerError("", err)
	}
	return record, nil
}
