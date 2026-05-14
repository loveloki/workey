package main

import (
	"encoding/base64"
	"strings"
	"time"
)

// 通用工具函数

func today() string {
	return time.Now().Format("2006-01-02")
}

func nowDatetime() string {
	return time.Now().Format("2006-01-02 15:04:05")
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

func bytesEqual(a, b []byte) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
