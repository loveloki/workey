package app

import (
	"encoding/base64"
	"strings"
	"time"
)

// scanner 是 database/sql 的 Row 和 Rows 共有的 Scan 方法抽象
type scanner interface {
	Scan(dest ...interface{}) error
}

const dateFormat = "2006-01-02"

func today() string {
	return time.Now().UTC().Format(dateFormat)
}

func nowDatetime() string {
	_, s, _ := nowAll()
	return s
}

// nowAll 返回当前 UTC 的日期、RFC3339 字符串和 time.Time（同一 Now() 调用）
func nowAll() (string, string, time.Time) {
	now := time.Now().UTC()
	return now.Format(dateFormat), now.Format(time.RFC3339), now
}

// base64URLEncode 编码为 URL 安全的 Base64（不含填充）
func base64URLEncode(data []byte) string {
	return strings.TrimRight(base64.URLEncoding.EncodeToString(data), "=")
}

// base64URLDecode 解码 URL 安全的 Base64（自动补齐填充）
func base64URLDecode(s string) ([]byte, error) {
	switch len(s) % 4 {
	case 2:
		s += "=="
	case 3:
		s += "="
	}
	return base64.URLEncoding.DecodeString(s)
}
