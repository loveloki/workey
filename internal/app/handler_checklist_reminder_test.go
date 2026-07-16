package app

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestChecklistReminders_DailyAndIterationEnd(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "reminder-user", "password123")
	db.Exec("INSERT INTO user_settings (user_id, key, value) VALUES (?, 'iteration_start_date', '2024-01-01')", userID)
	db.Exec("INSERT INTO user_settings (user_id, key, value) VALUES (?, 'iteration_workdays', '2')", userID)
	db.Exec(`INSERT INTO attendance (user_id, date, clock_in, status, created_at, updated_at)
		VALUES (?, '2024-01-02', '2024-01-02T09:00:00Z', 'normal', '2024-01-02T09:00:00Z', '2024-01-02T09:00:00Z')`, userID)

	req := createAuthenticatedRequest(t, "GET", "/api/checklist-reminders?date=2024-01-02", "", userID)
	rr := httptest.NewRecorder()
	handleChecklistReminders(rr, req)

	require.Equal(t, http.StatusOK, rr.Code)
	var resp ChecklistReminderListResponse
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	require.Len(t, resp.Reminders, 2)
	assert.Equal(t, checklistKindDailyStart, resp.Reminders[0].Kind)
	assert.Equal(t, checklistKindIterationEnd, resp.Reminders[1].Kind)
	assert.Equal(t, int64(1), *resp.Reminders[1].IterationNumber)
	assert.Equal(t, "2024-01-01", resp.Reminders[1].IterationStart)
	assert.Equal(t, "2024-01-02", resp.Reminders[1].IterationEnd)

	var dailyItems, iterationItems []json.RawMessage
	require.NoError(t, json.Unmarshal([]byte(resp.Reminders[0].Checklist.Items), &dailyItems))
	require.NoError(t, json.Unmarshal([]byte(resp.Reminders[1].Checklist.Items), &iterationItems))
	assert.Greater(t, len(iterationItems), len(dailyItems))

	daily := resp.Reminders[0]
	body := fmt.Sprintf(`{"checklist_id":%d,"kind":"daily_start","occurrence_key":"2024-01-02","checked":[true,true,true,true],"notes":["","","",""]}`, daily.Checklist.ID)
	saveReq := createAuthenticatedRequest(t, "PUT", "/api/checklist-runs", body, userID)
	saveRR := httptest.NewRecorder()
	handleChecklistRuns(saveRR, saveReq)
	require.Equal(t, http.StatusOK, saveRR.Code)

	var saveResp ChecklistRunResponse
	require.NoError(t, json.Unmarshal(saveRR.Body.Bytes(), &saveResp))
	assert.True(t, saveResp.Run.Completed)
	assert.NotNil(t, saveResp.Run.CompletedAt)

	reloadReq := createAuthenticatedRequest(t, "GET", "/api/checklist-reminders?date=2024-01-02", "", userID)
	reloadRR := httptest.NewRecorder()
	handleChecklistReminders(reloadRR, reloadReq)
	require.Equal(t, http.StatusOK, reloadRR.Code)
	require.NoError(t, json.Unmarshal(reloadRR.Body.Bytes(), &resp))
	require.NotNil(t, resp.Reminders[0].Run)
	assert.True(t, resp.Reminders[0].Run.Completed)
}

func TestChecklistReminders_OnlyAfterClockIn(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "reminder-no-clock", "password123")
	req := createAuthenticatedRequest(t, "GET", "/api/checklist-reminders?date=2024-01-03", "", userID)
	rr := httptest.NewRecorder()
	handleChecklistReminders(rr, req)

	require.Equal(t, http.StatusOK, rr.Code)
	var resp ChecklistReminderListResponse
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	assert.Empty(t, resp.Reminders)
}

func TestChecklistReminders_NonIterationEndOnlyDaily(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "reminder-daily", "password123")
	db.Exec("INSERT INTO user_settings (user_id, key, value) VALUES (?, 'iteration_start_date', '2024-01-01')", userID)
	db.Exec("INSERT INTO user_settings (user_id, key, value) VALUES (?, 'iteration_duration_days', '14')", userID)
	db.Exec(`INSERT INTO attendance (user_id, date, clock_in, status) VALUES (?, '2024-01-01', '2024-01-01T09:00:00Z', 'normal')`, userID)

	req := createAuthenticatedRequest(t, "GET", "/api/checklist-reminders?date=2024-01-01", "", userID)
	rr := httptest.NewRecorder()
	handleChecklistReminders(rr, req)

	require.Equal(t, http.StatusOK, rr.Code)
	var resp ChecklistReminderListResponse
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	require.Len(t, resp.Reminders, 1)
	assert.Equal(t, checklistKindDailyStart, resp.Reminders[0].Kind)
}

func TestChecklistReminders_IterationEndWindow(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "reminder-end-window", "password123")
	db.Exec("INSERT INTO user_settings (user_id, key, value) VALUES (?, 'iteration_start_date', '2024-01-01')", userID)
	db.Exec("INSERT INTO user_settings (user_id, key, value) VALUES (?, 'iteration_duration_days', '14')", userID)
	db.Exec(`INSERT INTO attendance (user_id, date, clock_in, status) VALUES (?, '2024-01-12', '2024-01-12T09:00:00Z', 'normal')`, userID)

	req := createAuthenticatedRequest(t, "GET", "/api/checklist-reminders?date=2024-01-12", "", userID)
	rr := httptest.NewRecorder()
	handleChecklistReminders(rr, req)

	require.Equal(t, http.StatusOK, rr.Code)
	var resp ChecklistReminderListResponse
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	require.Len(t, resp.Reminders, 2)
	assert.Equal(t, checklistKindIterationEnd, resp.Reminders[1].Kind)
	assert.Equal(t, "2024-01-14", resp.Reminders[1].IterationEnd)
}

func TestChecklistRuns_ValidateItemCount(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "reminder-invalid", "password123")
	require.NoError(t, ensureReminderChecklists(userID))
	daily, err := getChecklistByKind(userID, checklistKindDailyStart)
	require.NoError(t, err)

	body := fmt.Sprintf(`{"checklist_id":%d,"kind":"daily_start","occurrence_key":"2024-01-01","checked":[true],"notes":[""]}`, daily.ID)
	req := createAuthenticatedRequest(t, "PUT", "/api/checklist-runs", body, userID)
	rr := httptest.NewRecorder()
	handleChecklistRuns(rr, req)
	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestReminderChecklistCannotBeDeleted(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	userID := createTestUser(t, "reminder-delete", "password123")
	require.NoError(t, ensureReminderChecklists(userID))
	daily, err := getChecklistByKind(userID, checklistKindDailyStart)
	require.NoError(t, err)

	req := createAuthenticatedRequest(t, "DELETE", fmt.Sprintf("/api/checklists?id=%d", daily.ID), "", userID)
	rr := httptest.NewRecorder()
	handleChecklists(rr, req)
	assert.Equal(t, http.StatusBadRequest, rr.Code)
}
