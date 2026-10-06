package app

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
		req := createAuthenticatedRequest(t, "POST", "/api/workey/attendance/clock-in", `{}`, userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var resp AttendanceResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		require.NotNil(t, resp.Attendance)
		assert.NotNil(t, resp.Attendance.ClockIn)
	})

	t.Run("重复打卡应返回冲突", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "POST", "/api/workey/attendance/clock-in", `{}`, userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusConflict, rr.Code)
	})
}

func TestHandleClockOut(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "clockoutuser", "password123")

	t.Run("未打卡时签退应返回错误", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "POST", "/api/workey/attendance/clock-out", "", userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("打卡后可以签退", func(t *testing.T) {
		// 先打卡
		reqIn := createAuthenticatedRequest(t, "POST", "/api/workey/attendance/clock-in", `{}`, userID)
		rrIn := httptest.NewRecorder()
		serveTest(rrIn, reqIn)
		require.Equal(t, http.StatusOK, rrIn.Code)

		// 再签退
		reqOut := createAuthenticatedRequest(t, "POST", "/api/workey/attendance/clock-out", "", userID)
		rrOut := httptest.NewRecorder()
		serveTest(rrOut, reqOut)

		assert.Equal(t, http.StatusOK, rrOut.Code)
	})
}

func TestHandleAttendanceToday(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "todayuser", "password123")

	t.Run("无记录时返回 null", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "GET", "/api/workey/attendance/today", "", userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

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
		req := createAuthenticatedRequest(t, "POST", "/api/workey/attendance/leave", "", userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

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

	req := createAuthenticatedRequest(t, "GET", "/api/workey/attendance/stats", "", userID)
	rr := httptest.NewRecorder()

	serveTest(rr, req)

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
		req := createAuthenticatedRequest(t, "GET", "/api/workey/attendance/range", "", userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("查询范围内的考勤", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "GET", "/api/workey/attendance/range?start=2024-01-01&end=2024-12-31", "", userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

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
	reqIn := createAuthenticatedRequest(t, "POST", "/api/workey/attendance/clock-in", `{}`, userID)
	rrIn := httptest.NewRecorder()
	serveTest(rrIn, reqIn)
	require.Equal(t, http.StatusOK, rrIn.Code)

	var clockResp AttendanceResponse
	require.NoError(t, json.Unmarshal(rrIn.Body.Bytes(), &clockResp))
	require.NotNil(t, clockResp.Attendance)
	date := clockResp.Attendance.Date

	t.Run("设置加班标记", func(t *testing.T) {
		body := `{"date":"` + date + `","is_overtime":true}`
		req := createAuthenticatedRequest(t, "POST", "/api/workey/attendance/overtime", body, userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var resp AttendanceResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		require.NotNil(t, resp.Attendance)
		assert.True(t, resp.Attendance.IsOvertime)
	})

	t.Run("缺少日期字段", func(t *testing.T) {
		body := `{"is_overtime":true}`
		req := createAuthenticatedRequest(t, "POST", "/api/workey/attendance/overtime", body, userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("不存在的日期记录", func(t *testing.T) {
		body := `{"date":"2099-01-01","is_overtime":true}`
		req := createAuthenticatedRequest(t, "POST", "/api/workey/attendance/overtime", body, userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusNotFound, rr.Code)
	})

	t.Run("GET 不允许", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "GET", "/api/workey/attendance/overtime", "", userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusNotFound, rr.Code)
	})

	t.Run("PUT 方法也可以", func(t *testing.T) {
		body := `{"date":"` + date + `","is_overtime":false}`
		req := createAuthenticatedRequest(t, "PUT", "/api/workey/attendance/overtime", body, userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
	})

	t.Run("无效 JSON", func(t *testing.T) {
		req := createAuthenticatedRequest(t, "POST", "/api/workey/attendance/overtime", "bad", userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})
}

func TestHandleLeaveOverwritesClockIn(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "leaveover", "password123")

	// 先打卡
	reqIn := createAuthenticatedRequest(t, "POST", "/api/workey/attendance/clock-in", `{}`, userID)
	rrIn := httptest.NewRecorder()
	serveTest(rrIn, reqIn)
	require.Equal(t, http.StatusOK, rrIn.Code)

	// 请假应覆盖打卡记录
	reqLeave := createAuthenticatedRequest(t, "POST", "/api/workey/attendance/leave", "", userID)
	rrLeave := httptest.NewRecorder()
	serveTest(rrLeave, reqLeave)

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
		req := createAuthenticatedRequest(t, "POST", "/api/workey/attendance/clock-in", body, userID)
		rr := httptest.NewRecorder()

		serveTest(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)

		var resp AttendanceResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		require.NotNil(t, resp.Attendance)
		assert.True(t, resp.Attendance.IsOvertime)
	})
}

func TestHandleClockInBusinessTrip(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "business-trip-user", "password123")

	req := createAuthenticatedRequest(t, "POST", "/api/workey/attendance/clock-in", `{"status":"business_trip"}`, userID)
	rr := httptest.NewRecorder()
	serveTest(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var resp AttendanceResponse
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	require.NotNil(t, resp.Attendance)
	assert.Equal(t, "business_trip", resp.Attendance.Status)
	assert.NotNil(t, resp.Attendance.ClockIn)
	assert.Nil(t, resp.Attendance.ClockOut)

	clockOutReq := createAuthenticatedRequest(t, "POST", "/api/workey/attendance/clock-out", "", userID)
	clockOutRR := httptest.NewRecorder()
	serveTest(clockOutRR, clockOutReq)
	assert.Equal(t, http.StatusBadRequest, clockOutRR.Code)
}

func TestHandleClockInRejectsUnknownStatus(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "invalid-attendance-status", "password123")
	req := createAuthenticatedRequest(t, "POST", "/api/workey/attendance/clock-in", `{"status":"unknown"}`, userID)
	rr := httptest.NewRecorder()
	serveTest(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestHandleClockIn_MethodNotAllowed(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "clockmethod", "password123")

	req := createAuthenticatedRequest(t, "GET", "/api/workey/attendance/clock-in", "", userID)
	rr := httptest.NewRecorder()
	serveTest(rr, req)
	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestHandleClockOut_MethodNotAllowed(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "clockoutm", "password123")

	req := createAuthenticatedRequest(t, "GET", "/api/workey/attendance/clock-out", "", userID)
	rr := httptest.NewRecorder()
	serveTest(rr, req)
	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestHandleLeave_MethodNotAllowed(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "leavem", "password123")

	req := createAuthenticatedRequest(t, "GET", "/api/workey/attendance/leave", "", userID)
	rr := httptest.NewRecorder()
	serveTest(rr, req)
	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestHandleAttendanceToday_MethodNotAllowed(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "todaym", "password123")

	req := createAuthenticatedRequest(t, "POST", "/api/workey/attendance/today", "", userID)
	rr := httptest.NewRecorder()
	serveTest(rr, req)
	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestHandleAttendanceStats_MethodNotAllowed(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "statsm", "password123")

	req := createAuthenticatedRequest(t, "POST", "/api/workey/attendance/stats", "", userID)
	rr := httptest.NewRecorder()
	serveTest(rr, req)
	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestHandleAttendanceRange_MethodNotAllowed(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "rangem", "password123")

	req := createAuthenticatedRequest(t, "POST", "/api/workey/attendance/range?start=2024-01-01&end=2024-12-31", "", userID)
	rr := httptest.NewRecorder()
	serveTest(rr, req)
	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestHandleHistoryDateRange_MethodNotAllowed(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "histm", "password123")

	req := createAuthenticatedRequest(t, "POST", "/api/workey/history/date-range", "", userID)
	rr := httptest.NewRecorder()
	serveTest(rr, req)
	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestHandleAttendanceRangeWithData(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "rangedata", "password123")
	insertTestRecord(t, attendanceCollection, userID, map[string]any{"date": "2024-06-01", "clock_in": "09:00", "clock_out": "18:00", "status": "normal", "is_overtime": true})
	insertTestRecord(t, attendanceCollection, userID, map[string]any{"date": "2024-06-02", "status": "leave"})

	req := createAuthenticatedRequest(t, "GET", "/api/workey/attendance/range?start=2024-06-01&end=2024-06-30", "", userID)
	rr := httptest.NewRecorder()

	serveTest(rr, req)

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
	// 插入 overtime 和 leave 数据；请假日即使标记加班也不计入加班天数。
	insertTestRecord(t, attendanceCollection, userID, map[string]any{"date": "2024-01-01", "clock_in": "09:00", "status": "normal", "is_overtime": true})
	insertTestRecord(t, attendanceCollection, userID, map[string]any{"date": "2024-01-02", "clock_in": "09:00", "status": "normal", "is_overtime": true})
	insertTestRecord(t, attendanceCollection, userID, map[string]any{"date": "2024-01-03", "status": "leave", "is_overtime": true})

	req := createAuthenticatedRequest(t, "GET", "/api/workey/attendance/stats", "", userID)
	rr := httptest.NewRecorder()

	serveTest(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)

	var resp AttendanceStatsResponse
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	assert.Equal(t, int64(2), resp.GlobalOvertimeDays)
	assert.Equal(t, int64(1), resp.GlobalLeaveDays)
	assert.Equal(t, int64(1), resp.GlobalRemaining)
}
