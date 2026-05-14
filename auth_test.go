package main

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestHashPassword(t *testing.T) {
	hash, err := hashPassword("mypassword")
	require.NoError(t, err)
	assert.NotEmpty(t, hash)
	assert.NotEqual(t, "mypassword", hash)
}

func TestCheckPassword(t *testing.T) {
	hash, _ := hashPassword("correct-password")

	assert.True(t, checkPassword("correct-password", hash))
	assert.False(t, checkPassword("wrong-password", hash))
	assert.False(t, checkPassword("", hash))
}

func TestCreateAndValidateJWT(t *testing.T) {
	jwtSecret = []byte("test-secret")

	token, err := createJWT(42)
	require.NoError(t, err)
	assert.NotEmpty(t, token)

	userID, exp, err := validateJWT(token)
	require.NoError(t, err)
	assert.Equal(t, int64(42), userID)
	assert.Greater(t, exp, time.Now().Unix())
}

func TestValidateJWT_InvalidToken(t *testing.T) {
	jwtSecret = []byte("test-secret")

	_, _, err := validateJWT("invalid.token.string")
	assert.Error(t, err)
}

func TestValidateJWT_WrongSecret(t *testing.T) {
	jwtSecret = []byte("secret-a")
	token, _ := createJWT(1)

	jwtSecret = []byte("secret-b")
	_, _, err := validateJWT(token)
	assert.Error(t, err)
}

func TestValidateJWT_DifferentUserIDs(t *testing.T) {
	jwtSecret = []byte("test-secret")

	tests := []int64{1, 100, 999999}
	for _, id := range tests {
		token, err := createJWT(id)
		require.NoError(t, err)

		gotID, _, err := validateJWT(token)
		require.NoError(t, err)
		assert.Equal(t, id, gotID)
	}
}

func TestGenerateRandomString(t *testing.T) {
	s1 := generateRandomString(32)
	s2 := generateRandomString(32)

	assert.Len(t, s1, 64) // hex 编码后长度翻倍
	assert.Len(t, s2, 64)
	assert.NotEqual(t, s1, s2) // 两次生成应不同
}
