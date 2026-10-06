package app

import (
	"time"
)

const dateFormat = "2006-01-02"

func today() string {
	return time.Now().UTC().Format(dateFormat)
}

func nowDatetime() string {
	return time.Now().UTC().Format(time.RFC3339)
}

func validDate(value string) bool {
	parsed, err := time.Parse(dateFormat, value)
	return err == nil && parsed.Format(dateFormat) == value
}
