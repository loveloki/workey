package main

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

// --- Password hashing ---

func hashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(bytes), err
}

func checkPassword(password, hash string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

// --- Simple JWT implementation (HMAC-SHA256) ---

type jwtHeader struct {
	Alg string `json:"alg"`
	Typ string `json:"typ"`
}

type jwtClaims struct {
	Sub int64 `json:"sub"`
	Exp int64 `json:"exp"`
	Iat int64 `json:"iat"`
}

func base64URLEncode(data []byte) string {
	return strings.TrimRight(base64.URLEncoding.EncodeToString(data), "=")
}

func base64URLDecode(s string) ([]byte, error) {
	// Add padding back
	switch len(s) % 4 {
	case 2:
		s += "=="
	case 3:
		s += "="
	}
	return base64.URLEncoding.DecodeString(s)
}

func createJWT(userID int64) (string, error) {
	header := jwtHeader{Alg: "HS256", Typ: "JWT"}
	claims := jwtClaims{
		Sub: userID,
		Iat: time.Now().Unix(),
		Exp: time.Now().Add(72 * time.Hour).Unix(),
	}

	hJSON, _ := json.Marshal(header)
	cJSON, _ := json.Marshal(claims)

	unsigned := base64URLEncode(hJSON) + "." + base64URLEncode(cJSON)

	mac := hmac.New(sha256.New, jwtSecret)
	mac.Write([]byte(unsigned))
	sig := base64URLEncode(mac.Sum(nil))

	return unsigned + "." + sig, nil
}

func validateJWT(token string) (int64, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return 0, errors.New("invalid token format")
	}

	// Verify signature
	unsigned := parts[0] + "." + parts[1]
	mac := hmac.New(sha256.New, jwtSecret)
	mac.Write([]byte(unsigned))
	expectedSig := base64URLEncode(mac.Sum(nil))

	if !hmac.Equal([]byte(parts[2]), []byte(expectedSig)) {
		return 0, errors.New("invalid signature")
	}

	// Decode claims
	claimsJSON, err := base64URLDecode(parts[1])
	if err != nil {
		return 0, fmt.Errorf("invalid claims: %w", err)
	}

	var claims jwtClaims
	if err := json.Unmarshal(claimsJSON, &claims); err != nil {
		return 0, fmt.Errorf("invalid claims JSON: %w", err)
	}

	if time.Now().Unix() > claims.Exp {
		return 0, errors.New("token expired")
	}

	return claims.Sub, nil
}

// --- Random string ---

func generateRandomString(n int) string {
	b := make([]byte, n)
	rand.Read(b)
	return hex.EncodeToString(b)
}
