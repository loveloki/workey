package main

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestToday(t *testing.T) {
	result := today()
	expected := time.Now().Format("2006-01-02")
	assert.Equal(t, expected, result)
}

func TestNowDatetime(t *testing.T) {
	result := nowDatetime()
	assert.Regexp(t, `^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$`, result)
}

func TestBase64URLEncode(t *testing.T) {
	tests := []struct {
		input    []byte
		expected string
	}{
		{[]byte{}, ""},
		{[]byte("hello"), "aGVsbG8"},
		{[]byte{0xff, 0xfe, 0xfd}, "__79"},
	}
	for _, tt := range tests {
		assert.Equal(t, tt.expected, base64URLEncode(tt.input))
	}
}

func TestBase64URLDecode(t *testing.T) {
	t.Run("正常解码", func(t *testing.T) {
		decoded, err := base64URLDecode("aGVsbG8")
		require.NoError(t, err)
		assert.Equal(t, []byte("hello"), decoded)
	})

	t.Run("编码-解码往返", func(t *testing.T) {
		original := []byte("test data 123 !@#")
		encoded := base64URLEncode(original)
		decoded, err := base64URLDecode(encoded)
		require.NoError(t, err)
		assert.Equal(t, original, decoded)
	})

	t.Run("无效输入应返回错误", func(t *testing.T) {
		_, err := base64URLDecode("!!!invalid!!!")
		assert.Error(t, err)
	})
}

func TestBytesEqual(t *testing.T) {
	assert.True(t, bytesEqual([]byte{1, 2, 3}, []byte{1, 2, 3}))
	assert.False(t, bytesEqual([]byte{1, 2, 3}, []byte{1, 2, 4}))
	assert.False(t, bytesEqual([]byte{1, 2}, []byte{1, 2, 3}))
	assert.True(t, bytesEqual([]byte{}, []byte{}))
	assert.True(t, bytesEqual(nil, nil))
}
