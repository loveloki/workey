package app

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"

	"github.com/golang-jwt/jwt/v5"
	"github.com/pocketbase/dbx"
	validation "github.com/pocketbase/ozzo-validation/v4"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/security"
)

const accountCollectionName = "workey_accounts"

var (
	errUsernameTaken = errors.New("username already taken")
	errInvalidToken  = errors.New("invalid authentication token")
)

// createAccount 在同一个 PocketBase 事务中建立认证记录和业务用户映射。
func createAccount(username, password string) (User, error) {
	var user User
	err := pbApp.RunInTransaction(func(txApp core.App) error {
		collection, err := txApp.FindCollectionByNameOrId(accountCollectionName)
		if err != nil {
			return err
		}
		record := core.NewRecord(collection)
		record.Set("username", username)
		record.SetPassword(password)
		if err := txApp.Save(record); err != nil {
			var fieldErrors validation.Errors
			if errors.As(err, &fieldErrors) {
				var fieldError validation.Error
				if errors.As(fieldErrors["username"], &fieldError) && fieldError.Code() == "validation_not_unique" {
					return errUsernameTaken
				}
			}
			return err
		}

		_, err = txApp.DB().NewQuery(
			"INSERT INTO workey_profiles (record_id, username, created_at) VALUES ({:recordID}, {:username}, {:createdAt})",
		).Bind(dbx.Params{
			"recordID": record.Id, "username": record.GetString("username"), "createdAt": nowDatetime(),
		}).Execute()
		if err != nil {
			if strings.Contains(err.Error(), "UNIQUE constraint failed: workey_profiles.username") {
				return errUsernameTaken
			}
			return err
		}

		// 必须使用事务内的连接读取映射，避免嵌套连接及未提交记录不可见。
		return txApp.DB().NewQuery(
			"SELECT id, username, created_at FROM workey_profiles WHERE record_id = {:recordID}",
		).Bind(dbx.Params{"recordID": record.Id}).One(&user)
	})
	if err != nil {
		return User{}, err
	}
	return user, nil
}

// accountForUser 用稳定的 numeric ID 查找 PocketBase 认证记录。
func accountForUser(userID int64) (*core.Record, error) {
	var recordID string
	if err := db.QueryRow("SELECT record_id FROM workey_profiles WHERE id = ?", userID).Scan(&recordID); err != nil {
		return nil, err
	}
	return pbApp.FindRecordById(accountCollectionName, recordID)
}

func validateUserPassword(userID int64, password string) (bool, error) {
	record, err := accountForUser(userID)
	if err != nil {
		return false, err
	}
	return record.ValidatePassword(password), nil
}

// userForAccount 只接受业务认证集合中的记录，API 始终返回原有的 User 形状。
func userForAccount(record *core.Record) (User, error) {
	if record == nil || record.Collection().Name != accountCollectionName || !record.Collection().IsAuth() {
		return User{}, errInvalidToken
	}
	var user User
	err := db.QueryRow(
		"SELECT id, username, created_at FROM workey_profiles WHERE record_id = ?", record.Id,
	).Scan(&user.ID, &user.Username, &user.CreatedAt)
	return user, err
}

func profileForUser(userID int64) (User, error) {
	var user User
	err := db.QueryRow(
		"SELECT id, username, created_at FROM workey_profiles WHERE id = ?", userID,
	).Scan(&user.ID, &user.Username, &user.CreatedAt)
	return user, err
}

// createJWT 由 PocketBase 签发 token，不再使用 WebDAV 的加密密钥。
func createJWT(userID int64) (string, error) {
	record, err := accountForUser(userID)
	if err != nil {
		return "", err
	}
	return record.NewAuthToken()
}

// validateJWT 由 PocketBase 验证签名及撤销状态，并将 record ID 映射回业务 ID。
func validateJWT(tokenString string) (int64, int64, error) {
	claims, err := security.ParseUnverifiedJWT(tokenString)
	if err != nil {
		return 0, 0, fmt.Errorf("%w: %v", errInvalidToken, err)
	}
	collection, err := pbApp.FindCachedCollectionByNameOrId(accountCollectionName)
	if err != nil {
		return 0, 0, err
	}
	recordID, _ := claims[core.TokenClaimId].(string)
	if claims[core.TokenClaimCollectionId] != collection.Id ||
		claims[core.TokenClaimType] != core.TokenTypeAuth || recordID == "" {
		return 0, 0, errInvalidToken
	}

	record, err := pbApp.FindAuthRecordByToken(tokenString, core.TokenTypeAuth)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) || errors.Is(err, jwt.ErrTokenUnverifiable) ||
			errors.Is(err, jwt.ErrTokenSignatureInvalid) || errors.Is(err, jwt.ErrTokenInvalidClaims) ||
			errors.Is(err, jwt.ErrTokenMalformed) {
			return 0, 0, fmt.Errorf("%w: %v", errInvalidToken, err)
		}
		return 0, 0, err
	}
	user, err := userForAccount(record)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return 0, 0, errInvalidToken
		}
		return 0, 0, err
	}

	// 仅在 PB 已完成认证后读取 exp，用于兼容原来的自动续期逻辑。
	exp, err := claims.GetExpirationTime()
	if err != nil || exp == nil {
		return 0, 0, errInvalidToken
	}
	return user.ID, exp.Unix(), nil
}

func generateRandomString(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		panic("crypto/rand: " + err.Error())
	}
	return hex.EncodeToString(b)
}
