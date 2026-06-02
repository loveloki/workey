package app

import (
	"bytes"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestAESGCMEncryptDecrypt 测试基本加密解密循环
func TestAESGCMEncryptDecrypt(t *testing.T) {
	key := deriveKey([]byte("test-secret"))
	plaintext := []byte("hello WebDAV sync")
	aad := []byte("test-aad")

	ciphertext, err := aesGCMEncrypt(key, plaintext, aad)
	require.NoError(t, err)
	assert.NotEqual(t, plaintext, ciphertext)

	decrypted, err := aesGCMDecrypt(key, ciphertext, aad)
	require.NoError(t, err)
	assert.Equal(t, plaintext, decrypted)
}

// TestAESGCMRandomness 每次加密结果应不同（nonce 随机）
func TestAESGCMRandomness(t *testing.T) {
	key := deriveKey([]byte("test-secret"))
	plaintext := []byte("same plaintext")
	aad := []byte("aad")

	c1, _ := aesGCMEncrypt(key, plaintext, aad)
	c2, _ := aesGCMEncrypt(key, plaintext, aad)
	assert.False(t, bytes.Equal(c1, c2), "两次加密结果应不同")
}

// TestAESGCMWrongAAD 错误 AAD 必须解密失败
func TestAESGCMWrongAAD(t *testing.T) {
	key := deriveKey([]byte("test-secret"))
	plaintext := []byte("sensitive data")

	ciphertext, err := aesGCMEncrypt(key, plaintext, []byte("correct-aad"))
	require.NoError(t, err)

	_, err = aesGCMDecrypt(key, ciphertext, []byte("wrong-aad"))
	assert.Error(t, err, "错误 AAD 应导致解密失败")
}

// TestAESGCMWrongKey 错误密鑰应解密失败
func TestAESGCMWrongKey(t *testing.T) {
	key1 := deriveKey([]byte("key1"))
	key2 := deriveKey([]byte("key2"))
	aad := []byte("aad")

	ciphertext, err := aesGCMEncrypt(key1, []byte("data"), aad)
	require.NoError(t, err)

	_, err = aesGCMDecrypt(key2, ciphertext, aad)
	assert.Error(t, err, "错误密鑰应导致解密失败")
}

// TestAESGCMTamperedCiphertext 篁改密文应解密失败
func TestAESGCMTamperedCiphertext(t *testing.T) {
	key := deriveKey([]byte("test-secret"))
	aad := []byte("aad")

	ciphertext, err := aesGCMEncrypt(key, []byte("original"), aad)
	require.NoError(t, err)

	// 篁改最后一个字节
	tampered := make([]byte, len(ciphertext))
	copy(tampered, ciphertext)
	tampered[len(tampered)-1] ^= 0xFF

	_, err = aesGCMDecrypt(key, tampered, aad)
	assert.Error(t, err, "篁改密文应导致解密失败")
}

// TestAESGCMTooShortCiphertext 过短密文应返回错误
func TestAESGCMTooShortCiphertext(t *testing.T) {
	key := deriveKey([]byte("test-secret"))
	_, err := aesGCMDecrypt(key, []byte("tooshort"), []byte("aad"))
	assert.Error(t, err)
}

// TestEncryptDecryptField 字符串字段加密解密
func TestEncryptDecryptField(t *testing.T) {
	key := deriveKey([]byte("secret"))
	original := "my-webdav-password"
	aad := "webdav_password"

	enc, err := encryptField(key, original, aad)
	require.NoError(t, err)
	assert.NotEqual(t, original, enc)
	assert.NotEmpty(t, enc)

	dec, err := decryptField(key, enc, aad)
	require.NoError(t, err)
	assert.Equal(t, original, dec)
}

// TestEncryptFieldEmpty 空字符串不加密
func TestEncryptFieldEmpty(t *testing.T) {
	key := deriveKey([]byte("secret"))
	enc, err := encryptField(key, "", "aad")
	require.NoError(t, err)
	assert.Equal(t, "", enc)

	dec, err := decryptField(key, "", "aad")
	require.NoError(t, err)
	assert.Equal(t, "", dec)
}

// TestDeriveKeyLength 派生密鑰应为 32 字节
func TestDeriveKeyLength(t *testing.T) {
	key := deriveKey([]byte("any-input"))
	assert.Len(t, key, 32)
}

// TestEncryptFieldWrongAAD AAD 不匹配时解密失败
func TestEncryptFieldWrongAAD(t *testing.T) {
	key := deriveKey([]byte("secret"))
	enc, err := encryptField(key, "password123", "webdav_password")
	require.NoError(t, err)

	_, err = decryptField(key, enc, "wrong_aad")
	assert.Error(t, err)
}
