package app

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestToday(t *testing.T) {
	assert.Equal(t, time.Now().UTC().Format("2006-01-02"), today())
}

func TestNowDatetime(t *testing.T) {
	assert.Regexp(t, `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$`, nowDatetime())
}

func TestValidDate(t *testing.T) {
	assert.True(t, validDate("2024-02-29"))
	assert.False(t, validDate("2023-02-29"))
	assert.False(t, validDate("2024-2-1"))
	assert.False(t, validDate(""))
}

func TestRecordIDAcceptsLegacyNumbers(t *testing.T) {
	var data struct {
		ID RecordID `json:"id"`
	}
	assert.NoError(t, decodeJSONForTest(`{"id": 42}`, &data))
	assert.Equal(t, RecordID("42"), data.ID)
	assert.NoError(t, decodeJSONForTest(`{"id": "abc123"}`, &data))
	assert.Equal(t, RecordID("abc123"), data.ID)
	assert.Error(t, decodeJSONForTest(`{"id": 1.5}`, &data))
}

func decodeJSONForTest(raw string, v any) error {
	return json.Unmarshal([]byte(raw), v)
}
