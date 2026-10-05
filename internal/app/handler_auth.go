package app

import (
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	validation "github.com/pocketbase/ozzo-validation/v4"
)

// 认证相关 handler：注册、登录、获取当前用户、修改密码

func handleRegister(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	req.Username = strings.TrimSpace(req.Username)
	if req.Username == "" || req.Password == "" {
		jsonError(w, "Username and password are required", http.StatusBadRequest)
		return
	}
	if len(req.Password) < 6 {
		jsonError(w, "Password must be at least 6 characters", http.StatusBadRequest)
		return
	}

	user, err := createAccount(req.Username, req.Password)
	if err != nil {
		var fieldErrors validation.Errors
		if errors.Is(err, errUsernameTaken) {
			jsonError(w, "Username already taken", http.StatusConflict)
			return
		}
		if errors.As(err, &fieldErrors) {
			jsonError(w, "Invalid username or password", http.StatusBadRequest)
			return
		}
		jsonError(w, "Internal error", http.StatusInternalServerError)
		return
	}

	token, err := createJWT(user.ID)
	if err != nil {
		jsonError(w, "Failed to create token", http.StatusInternalServerError)
		return
	}

	jsonOK(w, AuthResponse{Token: token, User: user})
}

func handleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	req.Username = strings.TrimSpace(req.Username)
	if req.Username == "" || req.Password == "" {
		jsonError(w, "Username and password are required", http.StatusBadRequest)
		return
	}

	// FindFirstRecordByData 对 identity 值参数绑定，不能拼接为 PB filter。
	record, err := pbApp.FindFirstRecordByData(accountCollectionName, "username", req.Username)
	if errors.Is(err, sql.ErrNoRows) {
		jsonError(w, "Invalid username or password", http.StatusUnauthorized)
		return
	} else if err != nil {
		jsonError(w, "Internal error", http.StatusInternalServerError)
		return
	}

	if !record.ValidatePassword(req.Password) {
		jsonError(w, "Invalid username or password", http.StatusUnauthorized)
		return
	}

	user, err := userForAccount(record)
	if err != nil {
		jsonError(w, "Internal error", http.StatusInternalServerError)
		return
	}
	token, err := record.NewAuthToken()
	if err != nil {
		jsonError(w, "Failed to create token", http.StatusInternalServerError)
		return
	}

	jsonOK(w, AuthResponse{Token: token, User: user})
}

func handleMe(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserID(r)
	user, err := profileForUser(userID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			jsonError(w, "User not found", http.StatusUnauthorized)
			return
		}
		jsonError(w, "Internal error", http.StatusInternalServerError)
		return
	}
	jsonOK(w, MeResponse{User: user})
}

func handleChangePassword(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserID(r)

	var req struct {
		OldPassword string `json:"old_password"`
		NewPassword string `json:"new_password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.OldPassword == "" || req.NewPassword == "" {
		jsonError(w, "Old and new passwords are required", http.StatusBadRequest)
		return
	}

	if len(req.NewPassword) < 6 {
		jsonError(w, "New password must be at least 6 characters", http.StatusBadRequest)
		return
	}

	record, err := accountForUser(userID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			jsonError(w, "User not found", http.StatusUnauthorized)
			return
		}
		jsonError(w, "Internal error", http.StatusInternalServerError)
		return
	}

	if !record.ValidatePassword(req.OldPassword) {
		jsonError(w, "Old password is incorrect", http.StatusUnauthorized)
		return
	}

	// PB 保存密码时会同时轮换 tokenKey，立即吊销所有旧 token。
	record.SetPassword(req.NewPassword)
	if err := pbApp.Save(record); err != nil {
		var fieldErrors validation.Errors
		if errors.As(err, &fieldErrors) {
			jsonError(w, "Invalid new password", http.StatusBadRequest)
			return
		}
		jsonError(w, "Failed to update password", http.StatusInternalServerError)
		return
	}
	token, err := record.NewAuthToken()
	if err != nil {
		jsonError(w, "Failed to create token", http.StatusInternalServerError)
		return
	}
	w.Header().Set("X-New-Token", token)

	// 如果用户有主密钥，用新密码重新加密后更新 WebDAV（尽力而为）
	if masterKey, loadErr := loadMasterKeyLocally(userID); loadErr == nil && masterKey != nil {
		if salt, encrypted, wrapErr := wrapMasterKeyWithPassword(masterKey, req.NewPassword); wrapErr == nil {
			emk := &EncryptedMasterKey{
				SaltHex:      hex.EncodeToString(salt),
				EncryptedHex: hex.EncodeToString(encrypted),
			}
			// 尝试上传到 WebDAV（如果已配置）
			if cfg, _ := getSyncConfig(userID); cfg != nil {
				client := newWebDAVClient(cfg)
				client.putEncryptedMasterKey(emk) // 忽略错误，尽力而为
			}
		}
	}

	jsonOK(w, MessageResponse{Message: "Password changed successfully"})
}
