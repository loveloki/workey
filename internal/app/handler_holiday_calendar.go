package app

import (
	"encoding/json"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"
)

func handleHolidayCalendar(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		handleGetHolidayCalendar(w, r)
	case http.MethodPost:
		handleImportHolidayCalendar(w, r)
	case http.MethodDelete:
		handleDeleteHolidayCalendarYear(w, r)
	default:
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func handleGetHolidayCalendar(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	query := `SELECT id, user_id, date, is_workday, name, source, created_at, updated_at
		FROM holiday_calendar_days WHERE user_id = ?`
	args := []any{userID}
	if year := r.URL.Query().Get("year"); year != "" {
		if _, err := strconv.Atoi(year); err != nil || len(year) != 4 {
			jsonError(w, "year must be a four-digit number", http.StatusBadRequest)
			return
		}
		query += " AND substr(date, 1, 4) = ?"
		args = append(args, year)
	}
	query += " ORDER BY date"

	rows, err := db.Query(query, args...)
	if err != nil {
		jsonError(w, "Failed to load holiday calendar", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	days := []HolidayCalendarDay{}
	summaries := map[int]*HolidayCalendarYearSummary{}
	for rows.Next() {
		var day HolidayCalendarDay
		var isWorkday int
		if err := rows.Scan(&day.ID, &day.UserID, &day.Date, &isWorkday, &day.Name,
			&day.Source, &day.CreatedAt, &day.UpdatedAt); err != nil {
			jsonError(w, "Failed to load holiday calendar", http.StatusInternalServerError)
			return
		}
		day.IsWorkday = isWorkday != 0
		days = append(days, day)
		year, _ := strconv.Atoi(day.Date[:4])
		summary := summaries[year]
		if summary == nil {
			summary = &HolidayCalendarYearSummary{Year: year}
			summaries[year] = summary
		}
		summary.DayCount++
		if day.IsWorkday {
			summary.WorkdayCount++
		} else {
			summary.HolidayCount++
		}
	}

	years := make([]HolidayCalendarYearSummary, 0, len(summaries))
	for _, summary := range summaries {
		years = append(years, *summary)
	}
	sort.Slice(years, func(i, j int) bool { return years[i].Year > years[j].Year })
	jsonOK(w, HolidayCalendarResponse{Days: days, Years: years})
}

func handleImportHolidayCalendar(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	var req HolidayCalendarImportRequest
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 2<<20))
	if err := decoder.Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if len(req.Days) == 0 {
		jsonError(w, "days must not be empty", http.StatusBadRequest)
		return
	}
	if len(req.Days) > 5000 {
		jsonError(w, "too many calendar days (max 5000)", http.StatusBadRequest)
		return
	}

	source := strings.TrimSpace(req.Source)
	if source == "" {
		source = "导入"
	}
	if len(source) > 200 {
		source = source[:200]
	}

	uniqueDays := map[string]HolidayCalendarImportDay{}
	yearSet := map[int]struct{}{}
	for _, day := range req.Days {
		date, err := time.Parse(dateFormat, day.Date)
		if err != nil || date.Format(dateFormat) != day.Date {
			jsonError(w, "calendar date must be in YYYY-MM-DD format", http.StatusBadRequest)
			return
		}
		day.Name = strings.TrimSpace(day.Name)
		if len(day.Name) > 100 {
			day.Name = day.Name[:100]
		}
		uniqueDays[day.Date] = day
		yearSet[date.Year()] = struct{}{}
	}

	tx, err := db.Begin()
	if err != nil {
		jsonError(w, "Failed to import holiday calendar", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	years := make([]int, 0, len(yearSet))
	for year := range yearSet {
		years = append(years, year)
	}
	sort.Ints(years)
	if req.ReplaceYears {
		for _, year := range years {
			if _, err := tx.Exec("DELETE FROM holiday_calendar_days WHERE user_id = ? AND substr(date, 1, 4) = ?", userID, strconv.Itoa(year)); err != nil {
				jsonError(w, "Failed to replace holiday calendar", http.StatusInternalServerError)
				return
			}
		}
	}

	now := nowDatetime()
	for _, day := range uniqueDays {
		isWorkday := 0
		if day.IsWorkday {
			isWorkday = 1
		}
		_, err := tx.Exec(`INSERT INTO holiday_calendar_days
			(user_id, date, is_workday, name, source, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(user_id, date) DO UPDATE SET
				is_workday = excluded.is_workday, name = excluded.name,
				source = excluded.source, updated_at = excluded.updated_at`,
			userID, day.Date, isWorkday, day.Name, source, now, now)
		if err != nil {
			jsonError(w, "Failed to import holiday calendar", http.StatusInternalServerError)
			return
		}
	}
	if err := tx.Commit(); err != nil {
		jsonError(w, "Failed to import holiday calendar", http.StatusInternalServerError)
		return
	}
	jsonOK(w, HolidayCalendarImportResponse{ImportedCount: len(uniqueDays), ReplacedYears: years})
}

func handleDeleteHolidayCalendarYear(w http.ResponseWriter, r *http.Request) {
	year := r.URL.Query().Get("year")
	parsedYear, err := strconv.Atoi(year)
	if err != nil || parsedYear < 1900 || parsedYear > 2200 || len(year) != 4 {
		jsonError(w, "year must be between 1900 and 2200", http.StatusBadRequest)
		return
	}
	result, err := db.Exec("DELETE FROM holiday_calendar_days WHERE user_id = ? AND substr(date, 1, 4) = ?", getUserID(r), year)
	if err != nil {
		jsonError(w, "Failed to delete holiday calendar", http.StatusInternalServerError)
		return
	}
	count, _ := result.RowsAffected()
	if count == 0 {
		jsonError(w, "Holiday calendar year not found", http.StatusNotFound)
		return
	}
	jsonOK(w, MessageResponse{Message: "Holiday calendar year deleted"})
}
