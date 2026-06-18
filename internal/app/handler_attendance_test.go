package app

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestHandleClockIn(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "clockuser", "password123")

	t.Run("打卡成功", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "POST", "/api/attendance/clock-in", `{}`, userID)
		rr := httptest.NewRecorder()

		handleClockIn(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var resp AttendanceResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		require.NotNil(t, resp.Attendance)
		assert.NotNil(t, resp.Attendance.ClockIn)
	})

	t.Run("重复打卡应返回冲突", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "POST", "/api/attendance/clock-in", `{}`, userID)
		rr := httptest.NewRecorder()

		handleClockIn(rr, req)

		assert.Equal(t, http.StatusConflict, rr.Code)
	})
}

func TestHandleClockOut(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "clockoutuser", "password123")

	t.Run("未打卡时签退应返回错误", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "POST", "/api/attendance/clock-out", "", userID)
		rr := httptest.NewRecorder()

		handleClockOut(rr, req)

		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("打卡后可以签退", func(t *testing.T) {
		// 先打卡
		reqIn := createAuthenticatedRequest(t, "POST", "/api/attendance/clock-in", `{}`, userID)
		rrIn := httptest.NewRecorder()
		handleClockIn(rrIn, reqIn)
		require.Equal(t, http.StatusOK, rrIn.Code)

		// 再签退
		reqOut := createAuthenticatedRequest(t, "POST", "/api/attendance/clock-out", "", userID)
		rrOut := httptest.NewRecorder()
		handleClockOut(rrOut, reqOut)

		assert.Equal(t, http.StatusOK, rrOut.Code)
	})
}

func TestHandleAttendanceToday(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "todayuser", "password123")

	t.Run("无记录时返回 null", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "GET", "/api/attendance/today", "", userID)
		rr := httptest.NewRecorder()

		handleAttendanceToday(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var resp AttendanceResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.Nil(t, resp.Attendance)
	})
}

func TestHandleLeave(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "leaveuser", "password123")

	t.Run("请假成功", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "POST", "/api/attendance/leave", "", userID)
		rr := httptest.NewRecorder()

		handleLeave(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var resp AttendanceResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		require.NotNil(t, resp.Attendance)
		assert.Equal(t, "leave", resp.Attendance.Status)
	})
}

func TestHandleAttendanceStats(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "statsuser", "password123")

	req := createAuthenticatedRequest(t, "GET", "/api/attendance/stats", "", userID)
	rr := httptest.NewRecorder()

	handleAttendanceStats(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)

	var resp AttendanceStatsResponse
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	assert.Equal(t, int64(0), resp.GlobalOvertimeDays)
	assert.Equal(t, int64(0), resp.GlobalLeaveDays)
}

func TestHandleAttendanceRange(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "rangeuser", "password123")

	t.Run("缺少参数应返回错误", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "GET", "/api/attendance/range", "", userID)
		rr := httptest.NewRecorder()

		handleAttendanceRange(rr, req)

		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("查询范围内的考勤", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "GET", "/api/attendance/range?start=2024-01-01&end=2024-12-31", "", userID)
		rr := httptest.NewRecorder()

		handleAttendanceRange(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var resp AttendanceListResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.Empty(t, resp.Attendances)
	})
}

func TestHandleAttendanceOvertime(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "otuser", "password123")

	// 先打卡创建记录
	reqIn := createAuthenticatedRequest(t, "POST", "/api/attendance/clock-in", `{}`, userID)
	rrIn := httptest.NewRecorder()
	handleClockIn(rrIn, reqIn)
	require.Equal(t, http.StatusOK, rrIn.Code)

	var clockResp AttendanceResponse
	require.NoError(t, json.Unmarshal(rrIn.Body.Bytes(), &clockResp))
	require.NotNil(t, clockResp.Attendance)
	date := clockResp.Attendance.Date

	t.Run("设置加班标记", func(t *testing.T) {
		body := `{"date":"` + date + `","is_overtime":true}`
		req := createAuthenticatedRequest(t, "POST", "/api/attendance/overtime", body, userID)
		rr := httptest.NewRecorder()

		handleAttendanceOvertime(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var resp AttendanceResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		require.NotNil(t, resp.Attendance)
		assert.True(t, resp.Attendance.IsOvertime)
	})

	t.Run("缺少日期字段", func(t *testing.T) {
		body := `{"is_overtime":true}`
		req := createAuthenticatedRequest(t, "POST", "/api/attendance/overtime", body, userID)
		rr := httptest.NewRecorder()

		handleAttendanceOvertime(rr, req)

		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("不存在的日期记录", func(t *testing.T) {
		body := `{"date":"2099-01-01","is_overtime":true}`
		req := createAuthenticatedRequest(t, "POST", "/api/attendance/overtime", body, userID)
		rr := httptest.NewRecorder()

		handleAttendanceOvertime(rr, req)

		assert.Equal(t, http.StatusNotFound, rr.Code)
	})

	t.Run("GET 不允许", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "GET", "/api/attendance/overtime", "", userID)
		rr := httptest.NewRecorder()

		handleAttendanceOvertime(rr, req)

		assert.Equal(t, http.StatusMethodNotAllowed, rr.Code)
	})

	t.Run("PUT 方法也可以", func(t *testing.T) {
		body := `{"date":"` + date + `","is_overtime":false}`
		req := createAuthenticatedRequest(t, "PUT", "/api/attendance/overtime", body, userID)
		rr := httptest.NewRecorder()

		handleAttendanceOvertime(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
	})

	t.Run("无效 JSON", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "POST", "/api/attendance/overtime", "bad", userID)
		rr := httptest.NewRecorder()

		handleAttendanceOvertime(rr, req)

		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})
}

func TestHandleLeaveOverwritesClockIn(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "leaveover", "password123")

	// 先打卡
	reqIn := createAuthenticatedRequest(t, "POST", "/api/attendance/clock-in", `{}`, userID)
	rrIn := httptest.NewRecorder()
	handleClockIn(rrIn, reqIn)
	require.Equal(t, http.StatusOK, rrIn.Code)

	// 请假应覆盖打卡记录
	reqLeave := createAuthenticatedRequest(t, "POST", "/api/attendance/leave", "", userID)
	rrLeave := httptest.NewRecorder()
	handleLeave(rrLeave, reqLeave)

	assert.Equal(t, http.StatusOK, rrLeave.Code)
	var resp AttendanceResponse
	require.NoError(t, json.Unmarshal(rrLeave.Body.Bytes(), &resp))
	require.NotNil(t, resp.Attendance)
	assert.Equal(t, "leave", resp.Attendance.Status)
}

func TestHandleClockInWithOvertime(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "otclockin", "password123")

	t.Run("打卡时标记加班", func(t *testing.T) {
		body := `{"is_overtime":true}`
		req := createAuthenticatedRequest(t, "POST", "/api/attendance/clock-in", body, userID)
		rr := httptest.NewRecorder()

		handleClockIn(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var resp AttendanceResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		require.NotNil(t, resp.Attendance)
		assert.True(t, resp.Attendance.IsOvertime)
	})
}

func TestHandleClockIn_MethodNotAllowed(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "clockmethod", "password123")

	req := createAuthenticatedRequest(t, "GET", "/api/attendance/clock-in", "", userID)
	rr := httptest.NewRecorder()
	handleClockIn(rr, req)
	assert.Equal(t, http.StatusMethodNotAllowed, rr.Code)
}

func TestHandleClockOut_MethodNotAllowed(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "clockoutm", "password123")

	req := createAuthenticatedRequest(t, "GET", "/api/attendance/clock-out", "", userID)
	rr := httptest.NewRecorder()
	handleClockOut(rr, req)
	assert.Equal(t, http.StatusMethodNotAllowed, rr.Code)
}

func TestHandleLeave_MethodNotAllowed(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "leavem", "password123")

	req := createAuthenticatedRequest(t, "GET", "/api/attendance/leave", "", userID)
	rr := httptest.NewRecorder()
	handleLeave(rr, req)
	assert.Equal(t, http.StatusMethodNotAllowed, rr.Code)
}

func TestHandleAttendanceToday_MethodNotAllowed(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "todaym", "password123")

	req := createAuthenticatedRequest(t, "POST", "/api/attendance/today", "", userID)
	rr := httptest.NewRecorder()
	handleAttendanceToday(rr, req)
	assert.Equal(t, http.StatusMethodNotAllowed, rr.Code)
}

func TestHandleAttendanceStats_MethodNotAllowed(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "statsm", "password123")

	req := createAuthenticatedRequest(t, "POST", "/api/attendance/stats", "", userID)
	rr := httptest.NewRecorder()
	handleAttendanceStats(rr, req)
	assert.Equal(t, http.StatusMethodNotAllowed, rr.Code)
}

func TestHandleAttendanceRange_MethodNotAllowed(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "rangem", "password123")

	req := createAuthenticatedRequest(t, "POST", "/api/attendance/range?start=2024-01-01&end=2024-12-31", "", userID)
	rr := httptest.NewRecorder()
	handleAttendanceRange(rr, req)
	assert.Equal(t, http.StatusMethodNotAllowed, rr.Code)
}

func TestHandleHistoryDateRange_MethodNotAllowed(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "histm", "password123")

	req := createAuthenticatedRequest(t, "POST", "/api/history/date-range", "", userID)
	rr := httptest.NewRecorder()
	handleHistoryDateRange(rr, req)
	assert.Equal(t, http.StatusMethodNotAllowed, rr.Code)
}

func TestHandleAttendanceRangeWithData(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "rangedata", "password123")
	_, now, _ := nowAll()

	db.Exec("INSERT INTO attendance (user_id, date, clock_in, clock_out, status, is_overtime, created_at, updated_at) VALUES (?, '2024-06-01', '09:00', '18:00', 'normal', 1, ?, ?)", userID, now, now)
	db.Exec("INSERT INTO attendance (user_id, date, status, is_overtime, created_at, updated_at) VALUES (?, '2024-06-02', 'leave', 0, ?, ?)", userID, now, now)

	req := createAuthenticatedRequest(t, "GET", "/api/attendance/range?start=2024-06-01&end=2024-06-30", "", userID)
	rr := httptest.NewRecorder()

	handleAttendanceRange(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)

	var resp AttendanceListResponse
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	assert.Len(t, resp.Attendances, 2)
	assert.True(t, resp.Attendances[0].IsOvertime)
}

func TestHandleAttendanceStatsWithData(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "statsdata", "password123")
	_, now, _ := nowAll()

	// 插入 overtime 和 leave 数据
	db.Exec("INSERT INTO attendance (user_id, date, clock_in, status, is_overtime, created_at, updated_at) VALUES (?, '2024-01-01', '09:00', 'normal', 1, ?, ?)", userID, now, now)
	db.Exec("INSERT INTO attendance (user_id, date, clock_in, status, is_overtime, created_at, updated_at) VALUES (?, '2024-01-02', '09:00', 'normal', 1, ?, ?)", userID, now, now)
	db.Exec("INSERT INTO attendance (user_id, date, status, is_overtime, created_at, updated_at) VALUES (?, '2024-01-03', 'leave', 0, ?, ?)", userID, now, now)

	req := createAuthenticatedRequest(t, "GET", "/api/attendance/stats", "", userID)
	rr := httptest.NewRecorder()

	handleAttendanceStats(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)

	var resp AttendanceStatsResponse
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	assert.Equal(t, int64(2), resp.GlobalOvertimeDays)
	assert.Equal(t, int64(1), resp.GlobalLeaveDays)
	assert.Equal(t, int64(1), resp.GlobalRemaining)
}

func TestGetUserReminderDelay(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "reminderuser", "password123")

	t.Run("默认延迟为 9 小时", func(t *testing.T) {
		d := getUserReminderDelay(userID)
		assert.Equal(t, 9, d)
	})

	t.Run("设置自定义延迟后返回正确值", func(t *testing.T) {
		db.Exec("INSERT INTO user_settings (user_id, key, value) VALUES (?, 'reminder_delay', '7')", userID)
		d := getUserReminderDelay(userID)
		assert.Equal(t, 7, d)
	})

	t.Run("无效的延迟值回退到默认", func(t *testing.T) {
		db.Exec("INSERT INTO user_settings (user_id, key, value) VALUES (?, 'reminder_delay', '0') ON CONFLICT(user_id, key) DO UPDATE SET value = '0'", userID)
		d := getUserReminderDelay(userID)
		assert.Equal(t, 9, d)
	})
}

func TestScheduleReminderOnClockIn(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "clockreminder", "password123")

	t.Run("打卡后创建 pending_reminder", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "POST", "/api/attendance/clock-in", `{}`, userID)
		rr := httptest.NewRecorder()
		handleClockIn(rr, req)
		assert.Equal(t, http.StatusOK, rr.Code)

		var count int
		err := db.QueryRow("SELECT COUNT(*) FROM pending_reminders WHERE user_id = ?", userID).Scan(&count)
		require.NoError(t, err)
		assert.Equal(t, 1, count)
	})
}

func TestDeleteReminderOnClockOut(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "outreminder", "password123")

	t.Run("签退后删除 pending_reminder", func(t *testing.T) {
		db.Exec("INSERT INTO pending_reminders (user_id, send_at) VALUES (?, ?)", userID, time.Now().UTC().Add(time.Hour).Format(time.RFC3339))

		reqIn := createAuthenticatedRequest(t, "POST", "/api/attendance/clock-in", `{}`, userID)
		rrIn := httptest.NewRecorder()
		handleClockIn(rrIn, reqIn)
		require.Equal(t, http.StatusOK, rrIn.Code)

		reqOut := createAuthenticatedRequest(t, "POST", "/api/attendance/clock-out", "", userID)
		rrOut := httptest.NewRecorder()
		handleClockOut(rrOut, reqOut)
		assert.Equal(t, http.StatusOK, rrOut.Code)

		var count int
		db.QueryRow("SELECT COUNT(*) FROM pending_reminders WHERE user_id = ?", userID).Scan(&count)
		assert.Equal(t, 0, count)
	})
}

func TestDeleteReminderOnLeave(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "leavereminder", "password123")

	t.Run("请假后删除 pending_reminder", func(t *testing.T) {
		db.Exec("INSERT INTO pending_reminders (user_id, send_at) VALUES (?, ?)", userID, time.Now().UTC().Add(time.Hour).Format(time.RFC3339))

		req := createAuthenticatedRequest(t, "POST", "/api/attendance/leave", "", userID)
		rr := httptest.NewRecorder()
		handleLeave(rr, req)
		assert.Equal(t, http.StatusOK, rr.Code)

		var count int
		db.QueryRow("SELECT COUNT(*) FROM pending_reminders WHERE user_id = ?", userID).Scan(&count)
		assert.Equal(t, 0, count)
	})
}

func TestFullReminderFlow(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "fullflow", "password123")

	t.Run("打卡后创建 pending_reminder，send_at 格式和值正确", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "POST", "/api/attendance/clock-in", `{}`, userID)
		rr := httptest.NewRecorder()
		handleClockIn(rr, req)
		require.Equal(t, http.StatusOK, rr.Code)

		var count int
		err := db.QueryRow("SELECT COUNT(*) FROM pending_reminders WHERE user_id = ?", userID).Scan(&count)
		require.NoError(t, err)
		require.Equal(t, 1, count, "打卡后应创建一条待发送提醒")

		var sendAt string
		err = db.QueryRow("SELECT send_at FROM pending_reminders WHERE user_id = ?", userID).Scan(&sendAt)
		require.NoError(t, err)

		_, now, _ := nowAll()
		t.Logf("now: %q", now)
		t.Logf("send_at(raw):  %q", sendAt)

		// time.RFC3339 格式化，send_at 应在未来（默认延迟 9 小时）
		assert.Contains(t, sendAt, "T", "RFC3339 格式包含 T")
		assert.Greater(t, sendAt, now, "send_at 应在当前时间之后")
	})

	t.Run("modernc.org/sqlite 存储 send_at 时自动转为 RFC3339", func(t *testing.T) {
		// 用空格格式插入
		spaceFmt := time.Now().UTC().Format("2006-01-02 15:04:05") // 故意用空格格式测试 SQLite 自动转换
		_, err := db.Exec(
			"INSERT INTO pending_reminders (user_id, send_at, attempts) VALUES (?, ?, 0)",
			userID, spaceFmt,
		)
		require.NoError(t, err)

		var stored string
		err = db.QueryRow("SELECT send_at FROM pending_reminders WHERE user_id = ? AND attempts = 0 ORDER BY id DESC LIMIT 1", userID).Scan(&stored)
		require.NoError(t, err)

		t.Logf("插入值(空格): %q", spaceFmt)
		t.Logf("读出值:       %q", stored)

		// modernc.org/sqlite 自动转为 RFC3339
		assert.Contains(t, stored, "T", "读出值被转为 RFC3339")
	})

	t.Run("processPending 处理到期提醒（无订阅时静默跳过）", func(t *testing.T) {
		notifier := NewNotifier()

		// 先查一下当前有多少 pending_reminders
		var before int
		require.NoError(t, db.QueryRow("SELECT COUNT(*) FROM pending_reminders WHERE user_id = ?", userID).Scan(&before))

		notifier.processPending()

		var after int
		require.NoError(t, db.QueryRow("SELECT COUNT(*) FROM pending_reminders WHERE user_id = ?", userID).Scan(&after))

		t.Logf("processPending 前: %d 条, 后: %d 条", before, after)
		// 无订阅时静默跳过，条数不变
		assert.Equal(t, before, after, "无推送订阅时 processPending 不应删除提醒")
	})

	t.Run("有推送订阅时 processPending 尝试发送（会失败）", func(t *testing.T) {
		notifier := NewNotifier()

		// 插入一条假的推送订阅
		_, err := db.Exec(
			"INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, 'https://example.com/push', 'fake-p256dh', 'fake-auth')",
			userID,
		)
		require.NoError(t, err)

		// 确保有一条到期的提醒
		var reminderID int64
		_, nowStr, _ := nowAll()
		err = db.QueryRow(
			"SELECT id FROM pending_reminders WHERE user_id = ? AND send_at <= ? LIMIT 1",
			userID, nowStr,
		).Scan(&reminderID)

		if err != nil {
			_, err = db.Exec(
				"INSERT INTO pending_reminders (user_id, send_at, attempts) VALUES (?, ?, 0)",
				userID, time.Now().UTC().Add(-time.Minute).Format(time.RFC3339),
			)
			require.NoError(t, err)
			require.NoError(t, db.QueryRow("SELECT id FROM pending_reminders WHERE user_id = ? ORDER BY id DESC LIMIT 1", userID).Scan(&reminderID))
		}

		var attemptsBefore int
		require.NoError(t, db.QueryRow("SELECT attempts FROM pending_reminders WHERE id = ?", reminderID).Scan(&attemptsBefore))

		notifier.processPending()

		var attemptsAfter int
		err = db.QueryRow("SELECT attempts FROM pending_reminders WHERE id = ?", reminderID).Scan(&attemptsAfter)
		require.NoError(t, err)

		t.Logf("提醒 %d: attempts %d → %d", reminderID, attemptsBefore, attemptsAfter)
		// 发送到假端点会失败，attempts 应增加
		assert.Greater(t, attemptsAfter, attemptsBefore, "推送到无效端点应增加 attempts")
	})

	t.Run("下班打卡后删除 pending_reminder", func(t *testing.T) {
		db.Exec("DELETE FROM attendance WHERE user_id = ?", userID)
		db.Exec("DELETE FROM pending_reminders WHERE user_id = ?", userID)

		reqIn := createAuthenticatedRequest(t, "POST", "/api/attendance/clock-in", `{}`, userID)
		rrIn := httptest.NewRecorder()
		handleClockIn(rrIn, reqIn)
		require.Equal(t, http.StatusOK, rrIn.Code)

		reqOut := createAuthenticatedRequest(t, "POST", "/api/attendance/clock-out", "", userID)
		rrOut := httptest.NewRecorder()
		handleClockOut(rrOut, reqOut)
		assert.Equal(t, http.StatusOK, rrOut.Code)

		var count int
		require.NoError(t, db.QueryRow("SELECT COUNT(*) FROM pending_reminders WHERE user_id = ?", userID).Scan(&count))
		assert.Equal(t, 0, count, "下班后应删除所有待发送提醒")
	})
}

func TestScheduleReminderWithCustomDelay(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "customdelay", "password123")

	t.Run("自定义延迟 7 小时", func(t *testing.T) {
		db.Exec("INSERT INTO user_settings (user_id, key, value) VALUES (?, 'reminder_delay', '7')", userID)

		req := createAuthenticatedRequest(t, "POST", "/api/attendance/clock-in", `{}`, userID)
		rr := httptest.NewRecorder()
		handleClockIn(rr, req)
		assert.Equal(t, http.StatusOK, rr.Code)

		var sendAt string
		err := db.QueryRow("SELECT send_at FROM pending_reminders WHERE user_id = ?", userID).Scan(&sendAt)
		require.NoError(t, err)
		assert.NotEmpty(t, sendAt)
	})
}
