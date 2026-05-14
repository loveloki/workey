package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

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

		var resp map[string]interface{}
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.NotNil(t, resp["clock_in"])
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

		var resp map[string]interface{}
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.Nil(t, resp["attendance"])
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

		var resp map[string]interface{}
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.Equal(t, "leave", resp["status"])
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

	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	assert.Equal(t, float64(0), resp["global_overtime_days"])
	assert.Equal(t, float64(0), resp["global_leave_days"])
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

		var resp map[string]interface{}
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.IsType(t, []interface{}{}, resp["attendances"])
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

	var clockResp map[string]interface{}
	require.NoError(t, json.Unmarshal(rrIn.Body.Bytes(), &clockResp))
	date := clockResp["date"].(string)

	t.Run("设置加班标记", func(t *testing.T) {
		body := `{"date":"` + date + `","is_overtime":true}`
		req := createAuthenticatedRequest(t, "POST", "/api/attendance/overtime", body, userID)
		rr := httptest.NewRecorder()

		handleAttendanceOvertime(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var resp map[string]interface{}
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.Equal(t, true, resp["is_overtime"])
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
	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(rrLeave.Body.Bytes(), &resp))
	assert.Equal(t, "leave", resp["status"])
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

		var resp map[string]interface{}
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.Equal(t, true, resp["is_overtime"])
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

	db.Exec("INSERT INTO attendance (user_id, date, clock_in, clock_out, status, is_overtime, created_at, updated_at) VALUES (?, '2024-06-01', '09:00', '18:00', 'normal', 1, datetime('now'), datetime('now'))", userID)
	db.Exec("INSERT INTO attendance (user_id, date, status, is_overtime, created_at, updated_at) VALUES (?, '2024-06-02', 'leave', 0, datetime('now'), datetime('now'))", userID)

	req := createAuthenticatedRequest(t, "GET", "/api/attendance/range?start=2024-06-01&end=2024-06-30", "", userID)
	rr := httptest.NewRecorder()

	handleAttendanceRange(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)

	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	atts := resp["attendances"].([]interface{})
	assert.Len(t, atts, 2)

	first := atts[0].(map[string]interface{})
	assert.Equal(t, true, first["is_overtime"])
}

func TestHandleAttendanceStatsWithData(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "statsdata", "password123")

	// 插入 overtime 和 leave 数据
	db.Exec("INSERT INTO attendance (user_id, date, clock_in, status, is_overtime, created_at, updated_at) VALUES (?, '2024-01-01', '09:00', 'normal', 1, datetime('now'), datetime('now'))", userID)
	db.Exec("INSERT INTO attendance (user_id, date, clock_in, status, is_overtime, created_at, updated_at) VALUES (?, '2024-01-02', '09:00', 'normal', 1, datetime('now'), datetime('now'))", userID)
	db.Exec("INSERT INTO attendance (user_id, date, status, is_overtime, created_at, updated_at) VALUES (?, '2024-01-03', 'leave', 0, datetime('now'), datetime('now'))", userID)

	req := createAuthenticatedRequest(t, "GET", "/api/attendance/stats", "", userID)
	rr := httptest.NewRecorder()

	handleAttendanceStats(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)

	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	assert.Equal(t, float64(2), resp["global_overtime_days"])
	assert.Equal(t, float64(1), resp["global_leave_days"])
	assert.Equal(t, float64(1), resp["global_remaining"])
}
