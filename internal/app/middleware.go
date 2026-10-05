package app

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"
)

// HTTP 中间件和 JSON 工具函数

type contextKey string

const userIDKey contextKey = "userID"

func corsMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Add("Vary", "Origin")
		origin := r.Header.Get("Origin")
		if isAllowedOrigin(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			w.Header().Set("Access-Control-Expose-Headers", "X-New-Token")
		}
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		next(w, r)
	}
}

func isAllowedOrigin(origin string) bool {
	if origin == "" || strings.ContainsAny(origin, "*?") {
		return false
	}
	for _, allowed := range allowedOrigins() {
		if allowed == origin {
			return true
		}
	}
	return false
}

// authMiddleware 校验 JWT token，并在即将过期时自动刷新
func authMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		auth := r.Header.Get("Authorization")
		if !strings.HasPrefix(auth, "Bearer ") {
			jsonError(w, "Missing or invalid authorization header", http.StatusUnauthorized)
			return
		}
		token := strings.TrimPrefix(auth, "Bearer ")
		userID, exp, err := validateJWT(token)
		if err != nil {
			if errors.Is(err, errInvalidToken) {
				jsonError(w, "Invalid or expired token", http.StatusUnauthorized)
			} else {
				jsonError(w, "Internal error", http.StatusInternalServerError)
			}
			return
		}

		// Token 距过期不足 24 小时时自动刷新
		if exp-time.Now().Unix() < 24*3600 {
			if newToken, err := createJWT(userID); err == nil {
				w.Header().Set("X-New-Token", newToken)
			}
		}

		ctx := context.WithValue(r.Context(), userIDKey, userID)
		next(w, r.WithContext(ctx))
	}
}

func jsonError(w http.ResponseWriter, message string, status int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}

func jsonOK(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

func getUserID(r *http.Request) int64 {
	id, _ := r.Context().Value(userIDKey).(int64)
	return id
}
