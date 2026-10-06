package app

import (
	"fmt"
	"strconv"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

const maxIterationCount = 10000

type iterationConfig struct {
	StartDate time.Time
	Workdays  int
	Calendar  map[string]bool
	Overrides map[int64]IterationOverride
}

func handleIterations(e *core.RequestEvent) error {
	response, err := iterationListForDate(e.App, e.Auth, time.Now().Format(dateFormat))
	if err != nil {
		return e.InternalServerError("Failed to calculate iterations", err)
	}
	return e.JSON(200, response)
}

func loadIterationConfig(app core.App, account *core.Record) (iterationConfig, error) {
	values := loadSettings(account)
	startDate, err := time.Parse(dateFormat, values["iteration_start_date"])
	if err != nil {
		startDate, _ = time.Parse(dateFormat, "2019-09-02")
	}
	workdays, err := strconv.Atoi(values["iteration_workdays"])
	if err != nil || workdays < 1 {
		workdays = 10
	}

	params := dbx.Params{"user": account.Id}
	days, err := findUserRecords(app, holidayCollection, "", "", params)
	if err != nil {
		return iterationConfig{}, err
	}
	calendar := make(map[string]bool, len(days))
	for _, day := range days {
		calendar[day.GetString("date")] = day.GetBool("is_workday")
	}

	records, err := findUserRecords(app, iterationOverrideCollection, "", "iteration_number", params)
	if err != nil {
		return iterationConfig{}, err
	}
	overrides := make(map[int64]IterationOverride, len(records))
	for _, record := range records {
		override := iterationOverrideFromRecord(record)
		overrides[override.IterationNumber] = override
	}
	return iterationConfig{StartDate: startDate, Workdays: workdays, Calendar: calendar, Overrides: overrides}, nil
}

func isIterationWorkday(date time.Time, calendar map[string]bool) bool {
	if value, ok := calendar[date.Format(dateFormat)]; ok {
		return value
	}
	weekday := date.Weekday()
	return weekday != time.Saturday && weekday != time.Sunday
}

// calculatedIterationEnd 统计配置的工作日数，并把尾随周末/节假日纳入当前 Iteration。
func calculatedIterationEnd(start time.Time, workdays int, calendar map[string]bool) (time.Time, error) {
	cursor := start
	count := 0
	for scanned := 0; scanned < 3660; scanned++ {
		if isIterationWorkday(cursor, calendar) {
			count++
		}
		if count >= workdays {
			nextStart := cursor.AddDate(0, 0, 1)
			for skipped := 0; skipped < 366; skipped++ {
				if isIterationWorkday(nextStart, calendar) {
					return nextStart.AddDate(0, 0, -1), nil
				}
				nextStart = nextStart.AddDate(0, 0, 1)
			}
			return time.Time{}, fmt.Errorf("cannot find next workday")
		}
		cursor = cursor.AddDate(0, 0, 1)
	}
	return time.Time{}, fmt.Errorf("cannot calculate iteration end")
}

func countIterationWorkdays(start, end time.Time, calendar map[string]bool) int {
	count := 0
	for cursor := start; !cursor.After(end); cursor = cursor.AddDate(0, 0, 1) {
		if isIterationWorkday(cursor, calendar) {
			count++
		}
	}
	return count
}

func buildIterationRange(number int64, cursor time.Time, config iterationConfig) (IterationRange, time.Time, error) {
	start := cursor
	end := time.Time{}
	isOverridden := false
	if override, ok := config.Overrides[number]; ok {
		var err error
		start, err = time.Parse(dateFormat, override.StartDate)
		if err != nil {
			return IterationRange{}, time.Time{}, err
		}
		end, err = time.Parse(dateFormat, override.EndDate)
		if err != nil {
			return IterationRange{}, time.Time{}, err
		}
		isOverridden = true
	} else {
		var err error
		end, err = calculatedIterationEnd(start, config.Workdays, config.Calendar)
		if err != nil {
			return IterationRange{}, time.Time{}, err
		}
	}

	return IterationRange{
		IterationNumber: number,
		StartDate:       start.Format(dateFormat),
		EndDate:         end.Format(dateFormat),
		CalendarDays:    int(end.Sub(start).Hours()/24) + 1,
		Workdays:        countIterationWorkdays(start, end, config.Calendar),
		IsOverridden:    isOverridden,
	}, end.AddDate(0, 0, 1), nil
}

func iterationListForDate(app core.App, account *core.Record, target string) (IterationListResponse, error) {
	config, err := loadIterationConfig(app, account)
	if err != nil {
		return IterationListResponse{}, err
	}
	targetDate, err := time.Parse(dateFormat, target)
	if err != nil {
		return IterationListResponse{}, err
	}

	maxOverride := int64(0)
	for number := range config.Overrides {
		if number > maxOverride {
			maxOverride = number
		}
	}

	ranges := make([]IterationRange, 0, 256)
	cursor := config.StartDate
	current := int64(1)
	stopAt := int64(0)
	for number := int64(1); number <= maxIterationCount; number++ {
		item, next, err := buildIterationRange(number, cursor, config)
		if err != nil {
			return IterationListResponse{}, err
		}
		ranges = append(ranges, item)
		start, _ := time.Parse(dateFormat, item.StartDate)
		end, _ := time.Parse(dateFormat, item.EndDate)
		if stopAt == 0 && (targetDate.Before(start) || !targetDate.After(end)) {
			current = number
			stopAt = number + 12
			if maxOverride+2 > stopAt {
				stopAt = maxOverride + 2
			}
		}
		cursor = next
		if stopAt > 0 && number >= stopAt {
			return IterationListResponse{CurrentIteration: current, Iterations: ranges}, nil
		}
	}
	return IterationListResponse{}, fmt.Errorf("iteration count exceeds limit")
}

// 迭代周期覆盖 handler

func handleGetIterationOverrides(e *core.RequestEvent) error {
	records, err := findUserRecords(e.App, iterationOverrideCollection, "", "iteration_number", dbx.Params{"user": e.Auth.Id})
	if err != nil {
		return e.InternalServerError("Internal error", err)
	}
	return e.JSON(200, IterationOverrideListResponse{Overrides: mapRecords(records, iterationOverrideFromRecord)})
}

func findIterationOverride(app core.App, userID string, number int64) (*core.Record, error) {
	return app.FindFirstRecordByFilter(iterationOverrideCollection, "user = {:user} && iteration_number = {:number}",
		dbx.Params{"user": userID, "number": number})
}

// handleSaveIterationOverride 按迭代序号新增或覆盖调整后的起止日期。
func handleSaveIterationOverride(e *core.RequestEvent) error {
	var req struct {
		IterationNumber int64  `json:"iteration_number"`
		StartDate       string `json:"start_date"`
		EndDate         string `json:"end_date"`
	}
	if err := e.BindBody(&req); err != nil {
		return e.BadRequestError("Invalid request body", err)
	}
	if req.IterationNumber < 1 {
		return e.BadRequestError("iteration_number must be >= 1", nil)
	}
	if !validDate(req.StartDate) {
		return e.BadRequestError("start_date must be in YYYY-MM-DD format", nil)
	}
	if !validDate(req.EndDate) {
		return e.BadRequestError("end_date must be in YYYY-MM-DD format", nil)
	}
	if req.StartDate > req.EndDate {
		return e.BadRequestError("start_date must be <= end_date", nil)
	}

	record, err := findIterationOverride(e.App, e.Auth.Id, req.IterationNumber)
	if isNotFound(err) {
		record, err = newUserRecord(e.App, iterationOverrideCollection, e.Auth.Id)
		if err == nil {
			record.Set("iteration_number", req.IterationNumber)
		}
	}
	if err != nil {
		return e.InternalServerError("Internal error", err)
	}
	record.Set("start_date", req.StartDate)
	record.Set("end_date", req.EndDate)
	if err := e.App.Save(record); err != nil {
		return e.InternalServerError("Internal error", err)
	}
	return e.JSON(200, IterationOverrideResponse{Override: iterationOverrideFromRecord(record)})
}

func handleDeleteIterationOverride(e *core.RequestEvent) error {
	number, err := strconv.ParseInt(e.Request.URL.Query().Get("iteration_number"), 10, 64)
	if err != nil {
		return e.BadRequestError("iteration_number query parameter is required", nil)
	}
	record, err := findIterationOverride(e.App, e.Auth.Id, number)
	if isNotFound(err) {
		return e.NotFoundError("Override not found", nil)
	} else if err != nil {
		return e.InternalServerError("Failed to delete override", err)
	}
	if err := e.App.Delete(record); err != nil {
		return e.InternalServerError("Failed to delete override", err)
	}
	return e.JSON(200, MessageResponse{Message: "Override deleted"})
}
