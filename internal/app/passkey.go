package app

import (
	"bytes"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"
)

// --- WebAuthn 用户接口实现 ---

// WebAuthnUser 实现 webauthn.User 接口，用于 WebAuthn 注册和认证
type WebAuthnUser struct {
	id          int64
	name        string
	credentials []webauthn.Credential
}

func (u *WebAuthnUser) WebAuthnID() []byte {
	return []byte(fmt.Sprintf("%d", u.id))
}

func (u *WebAuthnUser) WebAuthnName() string {
	return u.name
}

func (u *WebAuthnUser) WebAuthnDisplayName() string {
	return u.name
}

func (u *WebAuthnUser) WebAuthnCredentials() []webauthn.Credential {
	return u.credentials
}

// --- WebAuthn 实例管理（按 rpID 缓存）---

var (
	waInstances       = map[string]*webauthn.WebAuthn{}
	waInstancesMu     sync.Mutex
	errWebAuthnOrigin = errors.New("invalid or disallowed WebAuthn origin")
)

// getWebAuthn 根据请求的 Host 和 Origin 创建或获取缓存的 WebAuthn 实例
func getWebAuthn(r *http.Request) (*webauthn.WebAuthn, error) {
	rpID := getRPID(r)
	origin := getOrigin(r)
	if rpID == "" || origin == "" {
		return nil, errWebAuthnOrigin
	}
	cacheKey := rpID + "|" + origin

	waInstancesMu.Lock()
	defer waInstancesMu.Unlock()

	if wa, ok := waInstances[cacheKey]; ok {
		return wa, nil
	}

	wa, err := webauthn.New(&webauthn.Config{
		RPID:          rpID,
		RPDisplayName: "Workey",
		RPOrigins:     []string{origin},
	})
	if err != nil {
		return nil, err
	}

	waInstances[cacheKey] = wa
	return wa, nil
}

// --- Session 存储（用于 Begin/Finish 之间传递挑战数据）---

type sessionEntry struct {
	Session   *webauthn.SessionData
	ExpiresAt time.Time
}

var (
	registerSessions = map[int64]sessionEntry{}
	authSessions     = map[string]sessionEntry{}
	sessionMu        sync.Mutex
)

const sessionTimeout = 5 * time.Minute

func storeRegisterSession(userID int64, session *webauthn.SessionData) {
	sessionMu.Lock()
	defer sessionMu.Unlock()
	cleanExpiredSessions()
	registerSessions[userID] = sessionEntry{
		Session:   session,
		ExpiresAt: time.Now().Add(sessionTimeout),
	}
}

func getRegisterSession(userID int64) (*webauthn.SessionData, bool) {
	sessionMu.Lock()
	defer sessionMu.Unlock()
	entry, ok := registerSessions[userID]
	if !ok {
		return nil, false
	}
	delete(registerSessions, userID)
	if time.Now().After(entry.ExpiresAt) {
		return nil, false
	}
	return entry.Session, true
}

func storeAuthSession(challengeID string, session *webauthn.SessionData) {
	sessionMu.Lock()
	defer sessionMu.Unlock()
	cleanExpiredSessions()
	authSessions[challengeID] = sessionEntry{
		Session:   session,
		ExpiresAt: time.Now().Add(sessionTimeout),
	}
}

func getAuthSession(challengeID string) (*webauthn.SessionData, bool) {
	sessionMu.Lock()
	defer sessionMu.Unlock()
	entry, ok := authSessions[challengeID]
	if !ok {
		return nil, false
	}
	delete(authSessions, challengeID)
	if time.Now().After(entry.ExpiresAt) {
		return nil, false
	}
	return entry.Session, true
}

func cleanExpiredSessions() {
	now := time.Now()
	for k, v := range registerSessions {
		if now.After(v.ExpiresAt) {
			delete(registerSessions, k)
		}
	}
	for k, v := range authSessions {
		if now.After(v.ExpiresAt) {
			delete(authSessions, k)
		}
	}
}

// --- 辅助函数 ---

func getRPID(r *http.Request) string {
	origin := getOrigin(r)
	u, err := url.Parse(origin)
	if err != nil || origin == "" {
		return ""
	}
	return u.Hostname()
}

func getOrigin(r *http.Request) string {
	if origins, ok := r.Header["Origin"]; ok {
		if len(origins) != 1 || !isAllowedOrigin(origins[0]) || !validWebAuthnOrigin(origins[0]) {
			return ""
		}
		return origins[0]
	}

	// 无 Origin 的旧客户端继续使用后端 Host；浏览器跨域请求必须使用页面 Origin。
	scheme := "https"
	hostURL, err := url.Parse("https://" + r.Host)
	if err != nil || hostURL.Hostname() == "" {
		return ""
	}
	if isLoopbackHostname(hostURL.Hostname()) {
		scheme = "http"
	}
	origin := scheme + "://" + r.Host
	if !validWebAuthnOrigin(origin) {
		return ""
	}
	return origin
}

func validWebAuthnOrigin(origin string) bool {
	u, err := url.Parse(origin)
	if err != nil || u.Hostname() == "" || u.User != nil || u.Opaque != "" ||
		u.Path != "" || u.RawQuery != "" || u.ForceQuery || u.Fragment != "" ||
		strings.ContainsAny(origin, "?#") {
		return false
	}
	return u.Scheme == "https" || (u.Scheme == "http" && isLoopbackHostname(u.Hostname()))
}

func isLoopbackHostname(host string) bool {
	if strings.EqualFold(host, "localhost") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func generateChallengeID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return base64URLEncode(b)
}

// loadWebAuthnUser 从数据库加载用户及其已注册的凭证
func loadWebAuthnUser(userID int64) (*WebAuthnUser, error) {
	var username string
	err := db.QueryRow("SELECT username FROM workey_profiles WHERE id = ?", userID).Scan(&username)
	if err != nil {
		return nil, err
	}

	creds := loadCredentials(userID)
	return &WebAuthnUser{
		id:          userID,
		name:        username,
		credentials: creds,
	}, nil
}

// loadCredentials 从数据库加载指定用户的所有凭证
func loadCredentials(userID int64) []webauthn.Credential {
	rows, err := db.Query("SELECT credential_id, public_key, sign_count FROM passkeys WHERE user_id = ?", userID)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var creds []webauthn.Credential
	for rows.Next() {
		var credID, pubKey []byte
		var signCount int64
		if err := rows.Scan(&credID, &pubKey, &signCount); err != nil {
			continue
		}
		creds = append(creds, webauthn.Credential{
			ID:        credID,
			PublicKey: pubKey,
			Flags: webauthn.CredentialFlags{
				// 平台认证器的通行密钥支持备份（iCloud Keychain 等），
				// 需要设置此标志以通过 go-webauthn 的一致性校验
				BackupEligible: true,
				BackupState:    true,
			},
			Authenticator: webauthn.Authenticator{
				SignCount: uint32(signCount),
			},
		})
	}
	return creds
}

// --- 路由 ---

func passkeyRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/passkeys/register/begin", corsMiddleware(authMiddleware(handlePasskeyRegisterBegin)))
	mux.HandleFunc("/api/passkeys/register/finish", corsMiddleware(authMiddleware(handlePasskeyRegisterFinish)))
	mux.HandleFunc("/api/passkeys/auth/begin", corsMiddleware(handlePasskeyAuthBegin))
	mux.HandleFunc("/api/passkeys/auth/finish", corsMiddleware(handlePasskeyAuthFinish))
	mux.HandleFunc("/api/passkeys", corsMiddleware(authMiddleware(handlePasskeys)))
}

func handlePasskeys(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case "GET":
		handlePasskeyList(w, r)
	case "DELETE":
		handlePasskeyDelete(w, r)
	default:
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// --- 注册流程 ---

func handlePasskeyRegisterBegin(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserID(r)

	wa, err := getWebAuthn(r)
	if err != nil {
		if errors.Is(err, errWebAuthnOrigin) {
			jsonError(w, "Invalid or disallowed origin", http.StatusBadRequest)
			return
		}
		jsonError(w, "WebAuthn configuration error", http.StatusInternalServerError)
		return
	}

	waUser, err := loadWebAuthnUser(userID)
	if err != nil {
		jsonError(w, "User not found", http.StatusNotFound)
		return
	}

	// 构建排除列表，防止重复注册已有凭证
	existingCreds := waUser.WebAuthnCredentials()
	excludeList := make([]protocol.CredentialDescriptor, len(existingCreds))
	for i, cred := range existingCreds {
		excludeList[i] = protocol.CredentialDescriptor{
			Type:         protocol.PublicKeyCredentialType,
			CredentialID: cred.ID,
		}
	}

	rrk := true
	creation, session, err := wa.BeginRegistration(waUser,
		webauthn.WithAuthenticatorSelection(protocol.AuthenticatorSelection{
			AuthenticatorAttachment: protocol.Platform,
			ResidentKey:             protocol.ResidentKeyRequirementRequired,
			RequireResidentKey:      &rrk,
			UserVerification:        protocol.VerificationPreferred,
		}),
		webauthn.WithConveyancePreference(protocol.PreferNoAttestation),
		webauthn.WithExclusions(excludeList),
	)
	if err != nil {
		jsonError(w, "Failed to begin registration: "+err.Error(), http.StatusInternalServerError)
		return
	}

	storeRegisterSession(userID, session)

	// 返回 PublicKeyCredentialCreationOptions（不含 publicKey 包装层），与前端 API 兼容
	jsonOK(w, creation.Response)
}

func handlePasskeyRegisterFinish(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserID(r)

	// 读取请求体（需要多次使用）
	bodyBytes, err := io.ReadAll(r.Body)
	if err != nil {
		jsonError(w, "Failed to read request body", http.StatusBadRequest)
		return
	}

	// 提取 name 字段
	var extra struct {
		Name string `json:"name"`
	}
	json.Unmarshal(bodyBytes, &extra)
	if extra.Name == "" {
		extra.Name = "Passkey"
	}

	// 获取注册 session
	session, ok := getRegisterSession(userID)
	if !ok {
		jsonError(w, "Challenge expired or not found", http.StatusBadRequest)
		return
	}

	// 解析 WebAuthn 凭证创建响应
	parsedResponse, err := protocol.ParseCredentialCreationResponseBody(bytes.NewReader(bodyBytes))
	if err != nil {
		jsonError(w, "Invalid credential response: "+err.Error(), http.StatusBadRequest)
		return
	}

	wa, err := getWebAuthn(r)
	if err != nil {
		if errors.Is(err, errWebAuthnOrigin) {
			jsonError(w, "Invalid or disallowed origin", http.StatusBadRequest)
			return
		}
		jsonError(w, "WebAuthn configuration error", http.StatusInternalServerError)
		return
	}

	waUser, err := loadWebAuthnUser(userID)
	if err != nil {
		jsonError(w, "User not found", http.StatusNotFound)
		return
	}

	// 验证凭证并创建
	credential, err := wa.CreateCredential(waUser, *session, parsedResponse)
	if err != nil {
		jsonError(w, "Registration verification failed: "+err.Error(), http.StatusBadRequest)
		return
	}

	// 存储到数据库
	now := nowDatetime()
	result, dbErr := db.Exec(
		"INSERT INTO passkeys (user_id, name, credential_id, public_key, sign_count, created_at) VALUES (?, ?, ?, ?, ?, ?)",
		userID, extra.Name, credential.ID, credential.PublicKey, credential.Authenticator.SignCount, now,
	)
	if dbErr != nil {
		if strings.Contains(dbErr.Error(), "UNIQUE") {
			jsonError(w, "This passkey is already registered", http.StatusConflict)
			return
		}
		jsonError(w, "Failed to save passkey", http.StatusInternalServerError)
		return
	}

	passkeyID, _ := result.LastInsertId()

	jsonOK(w, PasskeyRegisterResponse{
		Passkey: Passkey{
			ID:        passkeyID,
			Name:      extra.Name,
			CreatedAt: now,
		},
	})
}

// --- 认证流程 ---

func handlePasskeyAuthBegin(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	wa, err := getWebAuthn(r)
	if err != nil {
		if errors.Is(err, errWebAuthnOrigin) {
			jsonError(w, "Invalid or disallowed origin", http.StatusBadRequest)
			return
		}
		jsonError(w, "WebAuthn configuration error", http.StatusInternalServerError)
		return
	}

	assertion, session, err := wa.BeginDiscoverableLogin()
	if err != nil {
		jsonError(w, "Failed to begin authentication: "+err.Error(), http.StatusInternalServerError)
		return
	}

	challengeID := generateChallengeID()
	storeAuthSession(challengeID, session)

	jsonOK(w, PasskeyAuthBeginResponse{
		Challenge:        assertion.Response.Challenge,
		ChallengeID:      challengeID,
		RPID:             assertion.Response.RelyingPartyID,
		Timeout:          assertion.Response.Timeout,
		UserVerification: string(assertion.Response.UserVerification),
	})
}

func handlePasskeyAuthFinish(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 读取请求体
	bodyBytes, err := io.ReadAll(r.Body)
	if err != nil {
		jsonError(w, "Failed to read request body", http.StatusBadRequest)
		return
	}

	// 提取 challengeId
	var extra struct {
		ChallengeID string `json:"challengeId"`
	}
	json.Unmarshal(bodyBytes, &extra)
	extra.ChallengeID = strings.TrimSpace(extra.ChallengeID)
	if extra.ChallengeID == "" {
		jsonError(w, "challengeId is required", http.StatusBadRequest)
		return
	}

	// 查找认证 session
	session, ok := getAuthSession(extra.ChallengeID)
	if !ok {
		jsonError(w, "Challenge expired or not found", http.StatusBadRequest)
		return
	}

	// 解析 WebAuthn 断言响应
	parsedResponse, err := protocol.ParseCredentialRequestResponseBody(bytes.NewReader(bodyBytes))
	if err != nil {
		jsonError(w, "Invalid assertion response: "+err.Error(), http.StatusBadRequest)
		return
	}

	wa, err := getWebAuthn(r)
	if err != nil {
		if errors.Is(err, errWebAuthnOrigin) {
			jsonError(w, "Invalid or disallowed origin", http.StatusBadRequest)
			return
		}
		jsonError(w, "WebAuthn configuration error", http.StatusInternalServerError)
		return
	}

	// 使用可发现登录验证，通过凭证 ID 查找用户
	handler := func(rawID, userHandle []byte) (webauthn.User, error) {
		// 根据凭证 ID 查找用户
		var userID int64
		err := db.QueryRow("SELECT user_id FROM passkeys WHERE credential_id = ?", rawID).Scan(&userID)
		if err != nil {
			return nil, fmt.Errorf("passkey not found")
		}
		return loadWebAuthnUser(userID)
	}

	waUser, credential, err := wa.ValidatePasskeyLogin(handler, *session, parsedResponse)
	if err != nil {
		jsonError(w, "Authentication failed: "+err.Error(), http.StatusUnauthorized)
		return
	}

	// 更新签名计数和最近使用时间
	now := nowDatetime()
	db.Exec("UPDATE passkeys SET sign_count = ?, last_used_at = ? WHERE credential_id = ?",
		credential.Authenticator.SignCount, now, credential.ID)

	// 获取用户 ID 并创建 JWT
	waUserImpl := waUser.(*WebAuthnUser)
	token, err := createJWT(waUserImpl.id)
	if err != nil {
		jsonError(w, "Failed to create token", http.StatusInternalServerError)
		return
	}

	user, err := profileForUser(waUserImpl.id)
	if err != nil {
		jsonError(w, "Failed to load user", http.StatusInternalServerError)
		return
	}

	jsonOK(w, AuthResponse{Token: token, User: user})
}

// --- 列表和删除 ---

func handlePasskeyList(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)

	rows, err := db.Query(
		"SELECT id, name, created_at, last_used_at FROM passkeys WHERE user_id = ? ORDER BY created_at DESC",
		userID,
	)
	if err != nil {
		jsonError(w, "Internal error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	passkeys := []Passkey{}
	for rows.Next() {
		var p Passkey
		rows.Scan(&p.ID, &p.Name, &p.CreatedAt, &p.LastUsedAt)
		passkeys = append(passkeys, p)
	}

	jsonOK(w, PasskeyListResponse{Passkeys: passkeys})
}

func handlePasskeyDelete(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	id := r.URL.Query().Get("id")
	if id == "" {
		jsonError(w, "id query parameter is required", http.StatusBadRequest)
		return
	}

	result, err := db.Exec("DELETE FROM passkeys WHERE id = ? AND user_id = ?", id, userID)
	if err != nil {
		jsonError(w, "Failed to delete passkey", http.StatusInternalServerError)
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		jsonError(w, "Passkey not found", http.StatusNotFound)
		return
	}

	jsonOK(w, MessageResponse{Message: "Passkey deleted"})
}
