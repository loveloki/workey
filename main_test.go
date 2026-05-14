package main

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestRegisterRoutes(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	mux := http.NewServeMux()
	registerRoutes(mux)

	// 验证路由注册不会 panic
	assert.NotNil(t, mux)
}
