package app

import (
	"strconv"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

// 用户设置 handler：设置保存在 workey_accounts 认证记录的同名字段上，空值表示使用默认值。

var settingKeys = []string{
	"timezone", "theme", "iteration_start_date",
	"iteration_duration_days", "iteration_workdays", "reminder_delay",
}

func defaultSettings() map[string]string {
	return map[string]string{
		"timezone":                "+8",
		"theme":                   "light",
		"iteration_start_date":    "2019-09-02",
		"iteration_duration_days": "14",
		"iteration_workdays":      "10",
		"reminder_delay":          "9",
	}
}

func isSettingKey(key string) bool {
	for _, k := range settingKeys {
		if k == key {
			return true
		}
	}
	return false
}

// storedSettings 返回账号上已保存（非空）的设置。
func storedSettings(account *core.Record) map[string]string {
	values := map[string]string{}
	for _, key := range settingKeys {
		if value := account.GetString(key); value != "" {
			values[key] = value
		}
	}
	return values
}

// workdaysFromDurationDays 把旧版自然日周期按每周 5 个工作日换算（先除后乘避免溢出）。
func workdaysFromDurationDays(days int) int {
	workdays := (days/7)*5 + ((days%7)*5+3)/7
	if workdays < 1 {
		workdays = 1
	}
	return workdays
}

func loadSettings(account *core.Record) map[string]string {
	values := defaultSettings()
	stored := storedSettings(account)
	for key, value := range stored {
		values[key] = value
	}
	if stored["iteration_workdays"] == "" {
		if days, err := strconv.Atoi(values["iteration_duration_days"]); err == nil && days > 0 {
			values["iteration_workdays"] = strconv.Itoa(workdaysFromDurationDays(days))
		}
	}
	return values
}

func settingsResponse(values map[string]string) SettingsResponse {
	return SettingsResponse{
		Timezone:              values["timezone"],
		Theme:                 values["theme"],
		IterationStartDate:    values["iteration_start_date"],
		IterationDurationDays: values["iteration_duration_days"],
		IterationWorkdays:     values["iteration_workdays"],
		ReminderDelay:         values["reminder_delay"],
	}
}

func handleGetSettings(e *core.RequestEvent) error {
	return e.JSON(200, settingsResponse(loadSettings(e.Auth)))
}

func handleSaveSettings(e *core.RequestEvent) error {
	var req SettingsUpdateRequest
	if err := e.BindBody(&req); err != nil {
		return e.BadRequestError("Invalid request body", err)
	}
	if req.IterationStartDate != "" {
		if _, err := time.Parse(dateFormat, req.IterationStartDate); err != nil {
			return e.BadRequestError("iteration_start_date must be in YYYY-MM-DD format", nil)
		}
	}
	if req.IterationWorkdays != "" {
		workdays, err := strconv.Atoi(req.IterationWorkdays)
		if err != nil || workdays < 1 || workdays > 100 {
			return e.BadRequestError("iteration_workdays must be between 1 and 100", nil)
		}
	}
	// 旧客户端仍可只提交自然日周期。
	if req.IterationWorkdays == "" && req.IterationDurationDays != "" {
		days, err := strconv.Atoi(req.IterationDurationDays)
		if err != nil || days < 1 {
			return e.BadRequestError("iteration_duration_days must be a positive integer", nil)
		}
		req.IterationWorkdays = strconv.Itoa(workdaysFromDurationDays(days))
	}

	account := e.Auth
	for key, value := range map[string]string{
		"timezone":                req.Timezone,
		"theme":                   req.Theme,
		"iteration_start_date":    req.IterationStartDate,
		"iteration_duration_days": req.IterationDurationDays,
		"iteration_workdays":      req.IterationWorkdays,
		"reminder_delay":          req.ReminderDelay,
	} {
		if value != "" {
			account.Set(key, value)
		}
	}
	if err := e.App.Save(account); err != nil {
		return e.BadRequestError("Failed to save settings", err)
	}
	return e.JSON(200, settingsResponse(loadSettings(account)))
}
