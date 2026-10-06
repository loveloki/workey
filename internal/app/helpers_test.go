package app

import (
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
