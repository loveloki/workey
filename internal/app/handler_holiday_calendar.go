package app

import (
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

const maxHolidayImportBytes = 2 << 20

// yearParams 返回某年的日期区间过滤参数。
func yearParams(userID, year string) dbx.Params {
	return dbx.Params{"user": userID, "start": year + "-01-01", "end": year + "-12-31"}
}

const yearFilter = "date >= {:start} && date <= {:end}"

func handleGetHolidayCalendar(e *core.RequestEvent) error {
	filter := ""
	params := dbx.Params{"user": e.Auth.Id}
	if year := e.Request.URL.Query().Get("year"); year != "" {
		if _, err := strconv.Atoi(year); err != nil || len(year) != 4 {
			return e.BadRequestError("year must be a four-digit number", nil)
		}
		filter, params = yearFilter, yearParams(e.Auth.Id, year)
	}
	records, err := findUserRecords(e.App, holidayCollection, filter, "date", params)
	if err != nil {
		return e.InternalServerError("Failed to load holiday calendar", err)
	}

	days := mapRecords(records, holidayFromRecord)
	summaries := map[int]*HolidayCalendarYearSummary{}
	for _, day := range days {
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
	return e.JSON(200, HolidayCalendarResponse{Days: days, Years: years})
}

func handleImportHolidayCalendar(e *core.RequestEvent) error {
	var req HolidayCalendarImportRequest
	if err := e.BindBody(&req); err != nil {
		return e.BadRequestError("Invalid request body", err)
	}
	if len(req.Days) == 0 {
		return e.BadRequestError("days must not be empty", nil)
	}
	if len(req.Days) > 5000 {
		return e.BadRequestError("too many calendar days (max 5000)", nil)
	}
	source := strings.TrimSpace(req.Source)
	if source == "" {
		source = "导入"
	}
	source = truncateRunes(source, 200)

	uniqueDays := map[string]HolidayCalendarImportDay{}
	yearSet := map[int]struct{}{}
	for _, day := range req.Days {
		if !validDate(day.Date) {
			return e.BadRequestError("calendar date must be in YYYY-MM-DD format", nil)
		}
		day.Name = truncateRunes(strings.TrimSpace(day.Name), 100)
		uniqueDays[day.Date] = day
		date, _ := time.Parse(dateFormat, day.Date)
		yearSet[date.Year()] = struct{}{}
	}
	years := make([]int, 0, len(yearSet))
	for year := range yearSet {
		years = append(years, year)
	}
	sort.Ints(years)

	userID := e.Auth.Id
	err := e.App.RunInTransaction(func(txApp core.App) error {
		if req.ReplaceYears {
			for _, year := range years {
				if err := deleteHolidayYear(txApp, userID, strconv.Itoa(year), nil); err != nil {
					return err
				}
			}
		}
		for _, day := range uniqueDays {
			if err := upsertHolidayDay(txApp, userID, HolidayCalendarDay{
				Date: day.Date, IsWorkday: day.IsWorkday, Name: day.Name, Source: source,
			}); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return e.InternalServerError("Failed to import holiday calendar", err)
	}
	return e.JSON(200, HolidayCalendarImportResponse{ImportedCount: len(uniqueDays), ReplacedYears: years})
}

// upsertHolidayDay 按 (user, date) 新增或更新一天。
func upsertHolidayDay(app core.App, userID string, day HolidayCalendarDay) error {
	record, err := app.FindFirstRecordByFilter(holidayCollection, "user = {:user} && date = {:date}",
		dbx.Params{"user": userID, "date": day.Date})
	if isNotFound(err) {
		record, err = newUserRecord(app, holidayCollection, userID)
		if err == nil {
			record.Set("date", day.Date)
		}
	}
	if err != nil {
		return err
	}
	record.Set("is_workday", day.IsWorkday)
	record.Set("name", day.Name)
	record.Set("source", day.Source)
	return app.Save(record)
}

func deleteHolidayYear(app core.App, userID, year string, count *int) error {
	records, err := findUserRecords(app, holidayCollection, yearFilter, "", yearParams(userID, year))
	if err != nil {
		return err
	}
	for _, record := range records {
		if err := app.Delete(record); err != nil {
			return err
		}
	}
	if count != nil {
		*count = len(records)
	}
	return nil
}

func handleDeleteHolidayCalendarYear(e *core.RequestEvent) error {
	year := e.Request.URL.Query().Get("year")
	parsedYear, err := strconv.Atoi(year)
	if err != nil || parsedYear < 1900 || parsedYear > 2200 || len(year) != 4 {
		return e.BadRequestError("year must be between 1900 and 2200", nil)
	}
	var count int
	err = e.App.RunInTransaction(func(txApp core.App) error {
		return deleteHolidayYear(txApp, e.Auth.Id, year, &count)
	})
	if err != nil {
		return e.InternalServerError("Failed to delete holiday calendar", err)
	}
	if count == 0 {
		return e.NotFoundError("Holiday calendar year not found", nil)
	}
	return e.JSON(200, MessageResponse{Message: "Holiday calendar year deleted"})
}

func truncateRunes(value string, max int) string {
	runes := []rune(value)
	if len(runes) > max {
		return string(runes[:max])
	}
	return value
}
