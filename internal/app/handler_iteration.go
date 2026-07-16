package app

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"
)

const maxIterationCount = 10000

type iterationConfig struct {
	StartDate time.Time
	Workdays  int
	Calendar  map[string]bool
	Overrides map[int64]IterationOverride
}

func handleIterations(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	response, err := iterationListForDate(getUserID(r), time.Now().Format(dateFormat))
	if err != nil {
		jsonError(w, "Failed to calculate iterations", http.StatusInternalServerError)
		return
	}
	jsonOK(w, response)
}

func loadIterationConfig(userID int64) (iterationConfig, error) {
	values, err := loadSettings(userID)
	if err != nil {
		return iterationConfig{}, err
	}
	startDate, err := time.Parse(dateFormat, values["iteration_start_date"])
	if err != nil {
		startDate, _ = time.Parse(dateFormat, "2019-09-02")
	}
	workdays, err := strconv.Atoi(values["iteration_workdays"])
	if err != nil || workdays < 1 {
		workdays = 10
	}

	calendar := map[string]bool{}
	rows, err := db.Query("SELECT date, is_workday FROM holiday_calendar_days WHERE user_id = ?", userID)
	if err != nil {
		return iterationConfig{}, err
	}
	for rows.Next() {
		var date string
		var isWorkday int
		if err := rows.Scan(&date, &isWorkday); err != nil {
			rows.Close()
			return iterationConfig{}, err
		}
		calendar[date] = isWorkday != 0
	}
	if err := rows.Close(); err != nil {
		return iterationConfig{}, err
	}

	overrides := map[int64]IterationOverride{}
	rows, err = db.Query(`SELECT id, user_id, iteration_number, start_date, end_date, created_at, updated_at
		FROM iteration_overrides WHERE user_id = ? ORDER BY iteration_number`, userID)
	if err != nil {
		return iterationConfig{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var override IterationOverride
		if err := rows.Scan(&override.ID, &override.UserID, &override.IterationNumber, &override.StartDate,
			&override.EndDate, &override.CreatedAt, &override.UpdatedAt); err != nil {
			return iterationConfig{}, err
		}
		overrides[override.IterationNumber] = override
	}
	return iterationConfig{StartDate: startDate, Workdays: workdays, Calendar: calendar, Overrides: overrides}, rows.Err()
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

func iterationListForDate(userID int64, target string) (IterationListResponse, error) {
	config, err := loadIterationConfig(userID)
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

func iterationRangeForDate(userID int64, target string) (int64, string, string, error) {
	response, err := iterationListForDate(userID, target)
	if err != nil {
		return 0, "", "", err
	}
	for _, item := range response.Iterations {
		if item.IterationNumber == response.CurrentIteration {
			return item.IterationNumber, item.StartDate, item.EndDate, nil
		}
	}
	return 0, "", "", fmt.Errorf("current iteration not found")
}

// 迭代周期覆盖 handler

func handleIterationOverrides(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case "GET":
		handleGetIterationOverrides(w, r)
	case "POST":
		handleCreateIterationOverride(w, r)
	case "DELETE":
		handleDeleteIterationOverride(w, r)
	default:
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func handleGetIterationOverrides(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	rows, err := db.Query(
		"SELECT id, user_id, iteration_number, start_date, end_date, created_at, updated_at FROM iteration_overrides WHERE user_id = ? ORDER BY iteration_number",
		userID,
	)
	if err != nil {
		jsonError(w, "Internal error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	overrides := []IterationOverride{}
	for rows.Next() {
		var override IterationOverride
		if err := rows.Scan(&override.ID, &override.UserID, &override.IterationNumber, &override.StartDate,
			&override.EndDate, &override.CreatedAt, &override.UpdatedAt); err != nil {
			jsonError(w, "Internal error", http.StatusInternalServerError)
			return
		}
		overrides = append(overrides, override)
	}
	jsonOK(w, IterationOverrideListResponse{Overrides: overrides})
}

func handleCreateIterationOverride(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	var req struct {
		IterationNumber int64  `json:"iteration_number"`
		StartDate       string `json:"start_date"`
		EndDate         string `json:"end_date"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if req.IterationNumber < 1 {
		jsonError(w, "iteration_number must be >= 1", http.StatusBadRequest)
		return
	}
	startDate, err := time.Parse(dateFormat, req.StartDate)
	if err != nil {
		jsonError(w, "start_date must be in YYYY-MM-DD format", http.StatusBadRequest)
		return
	}
	endDate, err := time.Parse(dateFormat, req.EndDate)
	if err != nil {
		jsonError(w, "end_date must be in YYYY-MM-DD format", http.StatusBadRequest)
		return
	}
	if startDate.After(endDate) {
		jsonError(w, "start_date must be <= end_date", http.StatusBadRequest)
		return
	}

	now := nowDatetime()
	_, err = db.Exec(`INSERT INTO iteration_overrides
		(user_id, iteration_number, start_date, end_date, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?)
		ON CONFLICT(user_id, iteration_number) DO UPDATE SET
			start_date = excluded.start_date, end_date = excluded.end_date, updated_at = excluded.updated_at`,
		userID, req.IterationNumber, req.StartDate, req.EndDate, now, now)
	if err != nil {
		jsonError(w, "Internal error", http.StatusInternalServerError)
		return
	}

	var override IterationOverride
	err = db.QueryRow(
		"SELECT id, user_id, iteration_number, start_date, end_date, created_at, updated_at FROM iteration_overrides WHERE user_id = ? AND iteration_number = ?",
		userID, req.IterationNumber,
	).Scan(&override.ID, &override.UserID, &override.IterationNumber, &override.StartDate,
		&override.EndDate, &override.CreatedAt, &override.UpdatedAt)
	if err != nil {
		jsonError(w, "Internal error", http.StatusInternalServerError)
		return
	}
	jsonOK(w, IterationOverrideResponse{Override: override})
}

func handleDeleteIterationOverride(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	iterationNumber := r.URL.Query().Get("iteration_number")
	if iterationNumber == "" {
		jsonError(w, "iteration_number query parameter is required", http.StatusBadRequest)
		return
	}
	result, err := db.Exec("DELETE FROM iteration_overrides WHERE user_id = ? AND iteration_number = ?", userID, iterationNumber)
	if err != nil {
		jsonError(w, "Failed to delete override", http.StatusInternalServerError)
		return
	}
	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		jsonError(w, "Override not found", http.StatusNotFound)
		return
	}
	jsonOK(w, MessageResponse{Message: "Override deleted"})
}
