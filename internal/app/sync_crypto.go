package app

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"

	"golang.org/x/crypto/pbkdf2"
)

// AES-GCM 加密工具函数
// AAD（Additional Authenticated Data）用于防篁改：加密配置时传入用途标识

// PBKDF2 迭代次数（OWASP 推荐 600000 次以上）
const pbkdf2Iterations = 600000

// deriveKey 使用 PBKDF2 增强密钥派生（带盐和迭代），输出 32 字节 AES-256 密钥
func deriveKey(secret, salt []byte) []byte {
	return pbkdf2.Key(secret, salt, pbkdf2Iterations, 32, sha256.New)
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
	return hex.EncodeToString(ciphertext), nil
}

// decryptField 解密 hex 编码的密文字符串
// 使用标准库 encoding/hex 替代自定义实现（S1）
func decryptField(key []byte, hexCiphertext, aad string) (string, error) {
	if hexCiphertext == "" {
		return "", nil
	}
	ciphertext, err := hex.DecodeString(hexCiphertext)
	if err != nil {
		return "", err
	}
	plaintext, err := aesGCMDecrypt(key, ciphertext, []byte(aad))
	if err != nil {
		return "", err
	}
	return string(plaintext), nil
}
