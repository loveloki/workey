package app

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"errors"
	"io"
)

// AES-GCM 加密工具函数
// AAD（Additional Authenticated Data）用于防篁改：加密配置时传入用途标识

// deriveKey 从任意长度的秘钥派生 32 字节 AES-256 密鑰
func deriveKey(secret []byte) []byte {
	h := sha256.Sum256(secret)
	return h[:]
}

// aesGCMEncrypt 使用 AES-GCM 加密明文，aad 为附加认证数据
// 返回格式：[12字节 nonce][...]密文]
func aesGCMEncrypt(key, plaintext, aad []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err = io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}
	ciphertext := gcm.Seal(nonce, nonce, plaintext, aad)
	return ciphertext, nil
}

// aesGCMDecrypt 解密 AES-GCM 密文，aad 必须与加密时一致否则返回错误
func aesGCMDecrypt(key, ciphertext, aad []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonceSize := gcm.NonceSize()
	if len(ciphertext) < nonceSize {
		return nil, errors.New("ciphertext too short")
	}
	nonce, ciphertext := ciphertext[:nonceSize], ciphertext[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, aad)
	if err != nil {
		return nil, errors.New("decryption failed: authentication tag mismatch")
	}
	return plaintext, nil
}

// encryptField 将字符串字段加密，aad 传入用途标识
// 返回结果为 hex 编码的密文
func encryptField(key []byte, plaintext, aad string) (string, error) {
	if plaintext == "" {
		return "", nil
	}
	ciphertext, err := aesGCMEncrypt(key, []byte(plaintext), []byte(aad))
	if err != nil {
		return "", err
	}
	return encodeHex(ciphertext), nil
}

// decryptField 解密 hex 编码的密文字符串
func decryptField(key []byte, hexCiphertext, aad string) (string, error) {
	if hexCiphertext == "" {
		return "", nil
	}
	ciphertext, err := decodeHex(hexCiphertext)
	if err != nil {
		return "", err
	}
	plaintext, err := aesGCMDecrypt(key, ciphertext, []byte(aad))
	if err != nil {
		return "", err
	}
	return string(plaintext), nil
}

// encodeHex 将字节切片编码为十六进制字符串
func encodeHex(b []byte) string {
	const hexChars = "0123456789abcdef"
	out := make([]byte, len(b)*2)
	for i, v := range b {
		out[i*2] = hexChars[v>>4]
		out[i*2+1] = hexChars[v&0xf]
	}
	return string(out)
}

// decodeHex 将十六进制字符串解码为字节切片
func decodeHex(s string) ([]byte, error) {
	if len(s)%2 != 0 {
		return nil, errors.New("odd hex string length")
	}
	b := make([]byte, len(s)/2)
	for i := 0; i < len(s); i += 2 {
		hi := hexVal(s[i])
		lo := hexVal(s[i+1])
		if hi == 255 || lo == 255 {
			return nil, errors.New("invalid hex character")
		}
		b[i/2] = hi<<4 | lo
	}
	return b, nil
}

func hexVal(c byte) byte {
	switch {
	case c >= '0' && c <= '9':
		return c - '0'
	case c >= 'a' && c <= 'f':
		return c - 'a' + 10
	case c >= 'A' && c <= 'F':
		return c - 'A' + 10
	}
	return 255
}
