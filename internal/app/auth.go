package app

import (
	"errors"
	"strings"

	validation "github.com/pocketbase/ozzo-validation/v4"
	"github.com/pocketbase/pocketbase/core"
)

// 认证 handler：账号即 PocketBase auth collection 记录，token 由 PocketBase 签发与校验。

type credentialsRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func readCredentials(e *core.RequestEvent) (credentialsRequest, error) {
	var req credentialsRequest
	if err := e.BindBody(&req); err != nil {
		return req, e.BadRequestError("Invalid request body", err)
	}
	req.Username = strings.TrimSpace(req.Username)
	if req.Username == "" || req.Password == "" {
		return req, e.BadRequestError("Username and password are required", nil)
	}
	return req, nil
}

func authResponse(e *core.RequestEvent, record *core.Record) error {
	token, err := record.NewAuthToken()
	if err != nil {
		return e.InternalServerError("Failed to create token", err)
	}
	return e.JSON(200, AuthResponse{Token: token, User: userFromRecord(record)})
}

func handleRegister(e *core.RequestEvent) error {
	req, err := readCredentials(e)
	if err != nil {
		return err
	}
	if len(req.Password) < 6 {
		return e.BadRequestError("Password must be at least 6 characters", nil)
	}
	collection, err := e.App.FindCachedCollectionByNameOrId(accountCollection)
	if err != nil {
		return e.InternalServerError("", err)
	}
	record := core.NewRecord(collection)
	record.Set("username", req.Username)
	record.SetPassword(req.Password)
	if err := e.App.Save(record); err != nil {
		var fieldErrors validation.Errors
		if errors.As(err, &fieldErrors) {
			var fieldError validation.Error
			if errors.As(fieldErrors["username"], &fieldError) && fieldError.Code() == "validation_not_unique" {
				return e.Error(409, "Username already taken", nil)
			}
			return e.BadRequestError("Invalid username or password", err)
		}
		return e.InternalServerError("", err)
	}
	return authResponse(e, record)
}

func handleLogin(e *core.RequestEvent) error {
	req, err := readCredentials(e)
	if err != nil {
		return err
	}
	// FindFirstRecordByData 对用户名做参数绑定，避免拼接 filter。
	record, err := e.App.FindFirstRecordByData(accountCollection, "username", req.Username)
	if err != nil && !isNotFound(err) {
		return e.InternalServerError("", err)
	}
	if record == nil || !record.ValidatePassword(req.Password) {
		return e.UnauthorizedError("Invalid username or password", nil)
	}
	return authResponse(e, record)
}

func handleMe(e *core.RequestEvent) error {
	return e.JSON(200, MeResponse{User: userFromRecord(e.Auth)})
}

// handleRefresh 为仍有效的 token 换发新 token（等价于 PocketBase 的 auth-refresh）。
func handleRefresh(e *core.RequestEvent) error {
	return authResponse(e, e.Auth)
}

func handleChangePassword(e *core.RequestEvent) error {
	var req struct {
		OldPassword string `json:"old_password"`
		NewPassword string `json:"new_password"`
	}
	if err := e.BindBody(&req); err != nil {
		return e.BadRequestError("Invalid request body", err)
	}
	if req.OldPassword == "" || req.NewPassword == "" {
		return e.BadRequestError("Old and new passwords are required", nil)
	}
	if len(req.NewPassword) < 6 {
		return e.BadRequestError("New password must be at least 6 characters", nil)
	}
	record := e.Auth
	if !record.ValidatePassword(req.OldPassword) {
		return e.UnauthorizedError("Old password is incorrect", nil)
	}
	// 修改密码时 PocketBase 会轮换 tokenKey，所有旧 token 立即失效；响应返回新 token。
	record.SetPassword(req.NewPassword)
	if err := e.App.Save(record); err != nil {
		var fieldErrors validation.Errors
		if errors.As(err, &fieldErrors) {
			return e.BadRequestError("Invalid new password", err)
		}
		return e.InternalServerError("Failed to update password", err)
	}
	return authResponse(e, record)
}
