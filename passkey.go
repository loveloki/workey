package main

import (
	"crypto"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"database/sql"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"time"
)

// --- Passkey DB ---

func initPasskeyDB() {
	query := `CREATE TABLE IF NOT EXISTS passkeys (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL REFERENCES users(id),
		name TEXT NOT NULL,
		credential_id BLOB NOT NULL UNIQUE,
		public_key BLOB NOT NULL,
		sign_count INTEGER NOT NULL DEFAULT 0,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		last_used_at DATETIME
	)`
	if _, err := db.Exec(query); err != nil {
		fmt.Printf("Warning: failed to create passkeys table: %v\n", err)
	}
}

// --- Challenge Store ---

type challengeEntry struct {
	Challenge []byte
	ExpiresAt time.Time
}

var (
	registerChallenges = make(map[int64]challengeEntry) // keyed by userID
	authChallenges     = make(map[string]challengeEntry) // keyed by username
	challengeMu        sync.Mutex
)

const challengeTimeout = 5 * time.Minute

func generateChallenge() ([]byte, error) {
	b := make([]byte, 32)
	_, err := rand.Read(b)
	return b, err
}

func storeRegisterChallenge(userID int64, challenge []byte) {
	challengeMu.Lock()
	defer challengeMu.Unlock()
	cleanExpiredChallenges()
	registerChallenges[userID] = challengeEntry{
		Challenge: challenge,
		ExpiresAt: time.Now().Add(challengeTimeout),
	}
}

func getRegisterChallenge(userID int64) ([]byte, bool) {
	challengeMu.Lock()
	defer challengeMu.Unlock()
	entry, ok := registerChallenges[userID]
	if !ok {
		return nil, false
	}
	delete(registerChallenges, userID)
	if time.Now().After(entry.ExpiresAt) {
		return nil, false
	}
	return entry.Challenge, true
}

func storeAuthChallenge(username string, challenge []byte) {
	challengeMu.Lock()
	defer challengeMu.Unlock()
	cleanExpiredChallenges()
	authChallenges[username] = challengeEntry{
		Challenge: challenge,
		ExpiresAt: time.Now().Add(challengeTimeout),
	}
}

func getAuthChallenge(username string) ([]byte, bool) {
	challengeMu.Lock()
	defer challengeMu.Unlock()
	entry, ok := authChallenges[username]
	if !ok {
		return nil, false
	}
	delete(authChallenges, username)
	if time.Now().After(entry.ExpiresAt) {
		return nil, false
	}
	return entry.Challenge, true
}

func cleanExpiredChallenges() {
	now := time.Now()
	for k, v := range registerChallenges {
		if now.After(v.ExpiresAt) {
			delete(registerChallenges, k)
		}
	}
	for k, v := range authChallenges {
		if now.After(v.ExpiresAt) {
			delete(authChallenges, k)
		}
	}
}

// --- Helper: derive origin and rpID from request ---

func getRPID(r *http.Request) string {
	host := r.Host
	// Strip port if present
	if idx := strings.LastIndex(host, ":"); idx != -1 {
		// Make sure it's not an IPv6 address bracket
		if !strings.Contains(host[idx:], "]") {
			host = host[:idx]
		}
	}
	return host
}

func getOrigin(r *http.Request) string {
	host := r.Host
	scheme := "https"
	hostOnly := getRPID(r)
	if strings.Contains(hostOnly, "localhost") || strings.Contains(hostOnly, "127.0.0.1") {
		scheme = "http"
	}
	return scheme + "://" + host
}

// --- Routes ---

func passkeyRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/passkeys/register/begin", corsMiddleware(authMiddleware(handlePasskeyRegisterBegin)))
	mux.HandleFunc("/api/passkeys/register/finish", corsMiddleware(authMiddleware(handlePasskeyRegisterFinish)))
	mux.HandleFunc("/api/passkeys/auth/begin", corsMiddleware(handlePasskeyAuthBegin))
	mux.HandleFunc("/api/passkeys/auth/finish", corsMiddleware(handlePasskeyAuthFinish))
	mux.HandleFunc("/api/passkeys", corsMiddleware(authMiddleware(handlePasskeys)))
}

// handlePasskeys dispatches GET and DELETE for /api/passkeys
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

// --- Register Begin ---

func handlePasskeyRegisterBegin(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserID(r)

	var username string
	err := db.QueryRow("SELECT username FROM users WHERE id = ?", userID).Scan(&username)
	if err != nil {
		jsonError(w, "User not found", http.StatusNotFound)
		return
	}

	challenge, err := generateChallenge()
	if err != nil {
		jsonError(w, "Failed to generate challenge", http.StatusInternalServerError)
		return
	}

	storeRegisterChallenge(userID, challenge)

	rpID := getRPID(r)

	// Get existing credential IDs to exclude
	rows, err := db.Query("SELECT credential_id FROM passkeys WHERE user_id = ?", userID)
	if err != nil {
		jsonError(w, "Internal error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	excludeCredentials := []map[string]interface{}{}
	for rows.Next() {
		var credID []byte
		rows.Scan(&credID)
		excludeCredentials = append(excludeCredentials, map[string]interface{}{
			"type": "public-key",
			"id":   base64URLEncode(credID),
		})
	}

	// userID as bytes for user.id field
	userIDBytes := fmt.Sprintf("%d", userID)

	response := map[string]interface{}{
		"challenge": base64URLEncode(challenge),
		"rp": map[string]string{
			"name": "Workey",
			"id":   rpID,
		},
		"user": map[string]interface{}{
			"id":          base64URLEncode([]byte(userIDBytes)),
			"name":        username,
			"displayName": username,
		},
		"pubKeyCredParams": []map[string]interface{}{
			{"type": "public-key", "alg": -7},   // ES256
			{"type": "public-key", "alg": -257}, // RS256
		},
		"authenticatorSelection": map[string]interface{}{
			"authenticatorAttachment": "platform",
			"residentKey":             "preferred",
			"userVerification":        "preferred",
		},
		"timeout":              60000,
		"attestation":          "none",
		"excludeCredentials":   excludeCredentials,
	}

	jsonOK(w, response)
}

// --- Register Finish ---

func handlePasskeyRegisterFinish(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserID(r)

	var req struct {
		Name     string `json:"name"`
		ID       string `json:"id"`
		RawID    string `json:"rawId"`
		Type     string `json:"type"`
		Response struct {
			AttestationObject string `json:"attestationObject"`
			ClientDataJSON    string `json:"clientDataJSON"`
		} `json:"response"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Type != "public-key" {
		jsonError(w, "Invalid credential type", http.StatusBadRequest)
		return
	}

	if req.Name == "" {
		req.Name = "Passkey"
	}

	// Decode clientDataJSON
	clientDataBytes, err := base64URLDecode(req.Response.ClientDataJSON)
	if err != nil {
		jsonError(w, "Invalid clientDataJSON encoding", http.StatusBadRequest)
		return
	}

	var clientData struct {
		Type      string `json:"type"`
		Challenge string `json:"challenge"`
		Origin    string `json:"origin"`
	}
	if err := json.Unmarshal(clientDataBytes, &clientData); err != nil {
		jsonError(w, "Invalid clientDataJSON", http.StatusBadRequest)
		return
	}

	if clientData.Type != "webauthn.create" {
		jsonError(w, "Invalid ceremony type", http.StatusBadRequest)
		return
	}

	// Validate origin
	expectedOrigin := getOrigin(r)
	if clientData.Origin != expectedOrigin {
		jsonError(w, "Origin mismatch", http.StatusBadRequest)
		return
	}

	// Validate challenge
	storedChallenge, ok := getRegisterChallenge(userID)
	if !ok {
		jsonError(w, "Challenge expired or not found", http.StatusBadRequest)
		return
	}

	challengeBytes, err := base64URLDecode(clientData.Challenge)
	if err != nil {
		jsonError(w, "Invalid challenge encoding", http.StatusBadRequest)
		return
	}

	if !bytesEqual(challengeBytes, storedChallenge) {
		jsonError(w, "Challenge mismatch", http.StatusBadRequest)
		return
	}

	// Decode attestation object
	attObjBytes, err := base64URLDecode(req.Response.AttestationObject)
	if err != nil {
		jsonError(w, "Invalid attestationObject encoding", http.StatusBadRequest)
		return
	}

	attObj, err := parseCBORMap(attObjBytes)
	if err != nil {
		jsonError(w, "Invalid attestation object: "+err.Error(), http.StatusBadRequest)
		return
	}

	authDataRaw, ok := attObj["authData"]
	if !ok {
		jsonError(w, "Missing authData in attestation object", http.StatusBadRequest)
		return
	}
	authData, ok := authDataRaw.([]byte)
	if !ok {
		jsonError(w, "Invalid authData type", http.StatusBadRequest)
		return
	}

	// Parse authData
	// rpIdHash (32) + flags (1) + signCount (4) = 37 bytes minimum
	if len(authData) < 37 {
		jsonError(w, "authData too short", http.StatusBadRequest)
		return
	}

	rpIDHash := authData[:32]
	flags := authData[32]
	signCount := binary.BigEndian.Uint32(authData[33:37])

	// Verify RP ID hash
	expectedRPIDHash := sha256.Sum256([]byte(getRPID(r)))
	if !bytesEqual(rpIDHash, expectedRPIDHash[:]) {
		jsonError(w, "RP ID hash mismatch", http.StatusBadRequest)
		return
	}

	// Check AT (attested credential data) flag (bit 6)
	if flags&0x40 == 0 {
		jsonError(w, "No attested credential data in authData", http.StatusBadRequest)
		return
	}

	// Parse attested credential data (after the 37 fixed bytes)
	if len(authData) < 37+16+2 {
		jsonError(w, "authData too short for attested credential data", http.StatusBadRequest)
		return
	}

	// AAGUID (16 bytes)
	// aaguid := authData[37:53]  // not needed

	// Credential ID length (2 bytes big-endian)
	credIDLen := int(binary.BigEndian.Uint16(authData[53:55]))
	if len(authData) < 55+credIDLen {
		jsonError(w, "authData too short for credential ID", http.StatusBadRequest)
		return
	}

	credentialID := authData[55 : 55+credIDLen]

	// Public key in COSE format starts after credential ID
	pubKeyBytes := authData[55+credIDLen:]

	// Parse COSE public key
	coseKey, err := parseCBORMap(pubKeyBytes)
	if err != nil {
		jsonError(w, "Invalid COSE key: "+err.Error(), http.StatusBadRequest)
		return
	}

	// Serialize the COSE key for storage
	pubKeyStored, err := marshalCOSEKey(coseKey)
	if err != nil {
		jsonError(w, "Failed to serialize public key: "+err.Error(), http.StatusBadRequest)
		return
	}

	// Verify we can actually parse it back as a usable key
	_, err = parseCOSEPublicKey(coseKey)
	if err != nil {
		jsonError(w, "Unsupported public key type: "+err.Error(), http.StatusBadRequest)
		return
	}

	// Store in DB
	now := nowDatetime()
	result, dbErr := db.Exec(
		"INSERT INTO passkeys (user_id, name, credential_id, public_key, sign_count, created_at) VALUES (?, ?, ?, ?, ?, ?)",
		userID, req.Name, credentialID, pubKeyStored, signCount, now,
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

	jsonOK(w, map[string]interface{}{
		"passkey": map[string]interface{}{
			"id":         passkeyID,
			"name":       req.Name,
			"created_at": now,
		},
	})

	_ = signCount // stored in DB
}

// --- Auth Begin ---

func handlePasskeyAuthBegin(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Username string `json:"username"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	req.Username = strings.TrimSpace(req.Username)
	if req.Username == "" {
		jsonError(w, "Username is required", http.StatusBadRequest)
		return
	}

	// Look up user
	var userID int64
	err := db.QueryRow("SELECT id FROM users WHERE username = ?", req.Username).Scan(&userID)
	if err == sql.ErrNoRows {
		jsonError(w, "User not found", http.StatusNotFound)
		return
	} else if err != nil {
		jsonError(w, "Internal error", http.StatusInternalServerError)
		return
	}

	// Get user's passkeys
	rows, err := db.Query("SELECT credential_id FROM passkeys WHERE user_id = ?", userID)
	if err != nil {
		jsonError(w, "Internal error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	allowCredentials := []map[string]interface{}{}
	for rows.Next() {
		var credID []byte
		rows.Scan(&credID)
		allowCredentials = append(allowCredentials, map[string]interface{}{
			"type": "public-key",
			"id":   base64URLEncode(credID),
		})
	}

	if len(allowCredentials) == 0 {
		jsonError(w, "No passkeys registered for this user", http.StatusNotFound)
		return
	}

	challenge, err := generateChallenge()
	if err != nil {
		jsonError(w, "Failed to generate challenge", http.StatusInternalServerError)
		return
	}

	storeAuthChallenge(req.Username, challenge)

	rpID := getRPID(r)

	response := map[string]interface{}{
		"challenge":        base64URLEncode(challenge),
		"rpId":             rpID,
		"allowCredentials": allowCredentials,
		"timeout":          60000,
		"userVerification": "preferred",
	}

	jsonOK(w, response)
}

// --- Auth Finish ---

func handlePasskeyAuthFinish(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Username string `json:"username"`
		ID       string `json:"id"`
		RawID    string `json:"rawId"`
		Type     string `json:"type"`
		Response struct {
			AuthenticatorData string `json:"authenticatorData"`
			ClientDataJSON    string `json:"clientDataJSON"`
			Signature         string `json:"signature"`
		} `json:"response"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Type != "public-key" {
		jsonError(w, "Invalid credential type", http.StatusBadRequest)
		return
	}

	req.Username = strings.TrimSpace(req.Username)
	if req.Username == "" {
		jsonError(w, "Username is required", http.StatusBadRequest)
		return
	}

	// Decode clientDataJSON
	clientDataBytes, err := base64URLDecode(req.Response.ClientDataJSON)
	if err != nil {
		jsonError(w, "Invalid clientDataJSON encoding", http.StatusBadRequest)
		return
	}

	var clientData struct {
		Type      string `json:"type"`
		Challenge string `json:"challenge"`
		Origin    string `json:"origin"`
	}
	if err := json.Unmarshal(clientDataBytes, &clientData); err != nil {
		jsonError(w, "Invalid clientDataJSON", http.StatusBadRequest)
		return
	}

	if clientData.Type != "webauthn.get" {
		jsonError(w, "Invalid ceremony type", http.StatusBadRequest)
		return
	}

	// Validate origin
	expectedOrigin := getOrigin(r)
	if clientData.Origin != expectedOrigin {
		jsonError(w, "Origin mismatch", http.StatusBadRequest)
		return
	}

	// Validate challenge
	storedChallenge, ok := getAuthChallenge(req.Username)
	if !ok {
		jsonError(w, "Challenge expired or not found", http.StatusBadRequest)
		return
	}

	challengeBytes, err := base64URLDecode(clientData.Challenge)
	if err != nil {
		jsonError(w, "Invalid challenge encoding", http.StatusBadRequest)
		return
	}

	if !bytesEqual(challengeBytes, storedChallenge) {
		jsonError(w, "Challenge mismatch", http.StatusBadRequest)
		return
	}

	// Decode credential ID
	credentialID, err := base64URLDecode(req.RawID)
	if err != nil {
		jsonError(w, "Invalid rawId encoding", http.StatusBadRequest)
		return
	}

	// Look up user and passkey
	var userID int64
	err = db.QueryRow("SELECT id FROM users WHERE username = ?", req.Username).Scan(&userID)
	if err != nil {
		jsonError(w, "User not found", http.StatusNotFound)
		return
	}

	var passkeyID int64
	var pubKeyStored []byte
	var storedSignCount int64
	err = db.QueryRow(
		"SELECT id, public_key, sign_count FROM passkeys WHERE user_id = ? AND credential_id = ?",
		userID, credentialID,
	).Scan(&passkeyID, &pubKeyStored, &storedSignCount)
	if err == sql.ErrNoRows {
		jsonError(w, "Passkey not found", http.StatusUnauthorized)
		return
	} else if err != nil {
		jsonError(w, "Internal error", http.StatusInternalServerError)
		return
	}

	// Decode authenticator data
	authDataBytes, err := base64URLDecode(req.Response.AuthenticatorData)
	if err != nil {
		jsonError(w, "Invalid authenticatorData encoding", http.StatusBadRequest)
		return
	}

	if len(authDataBytes) < 37 {
		jsonError(w, "authenticatorData too short", http.StatusBadRequest)
		return
	}

	// Verify RP ID hash
	rpIDHash := authDataBytes[:32]
	expectedRPIDHash := sha256.Sum256([]byte(getRPID(r)))
	if !bytesEqual(rpIDHash, expectedRPIDHash[:]) {
		jsonError(w, "RP ID hash mismatch", http.StatusBadRequest)
		return
	}

	// Check UP (user present) flag (bit 0)
	flags := authDataBytes[32]
	if flags&0x01 == 0 {
		jsonError(w, "User not present", http.StatusBadRequest)
		return
	}

	newSignCount := binary.BigEndian.Uint32(authDataBytes[33:37])

	// Check sign count (if both are non-zero, new must be greater)
	if storedSignCount > 0 && newSignCount > 0 && uint32(storedSignCount) >= newSignCount {
		jsonError(w, "Sign count regression detected (possible cloned authenticator)", http.StatusBadRequest)
		return
	}

	// Decode signature
	signatureBytes, err := base64URLDecode(req.Response.Signature)
	if err != nil {
		jsonError(w, "Invalid signature encoding", http.StatusBadRequest)
		return
	}

	// Reconstruct signed data: authenticatorData + SHA256(clientDataJSON)
	clientDataHash := sha256.Sum256(clientDataBytes)
	signedData := append(authDataBytes, clientDataHash[:]...)

	// Parse stored public key
	coseKey, err := parseCBORMap(pubKeyStored)
	if err != nil {
		jsonError(w, "Failed to parse stored public key", http.StatusInternalServerError)
		return
	}

	pubKey, err := parseCOSEPublicKey(coseKey)
	if err != nil {
		jsonError(w, "Failed to parse public key: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Verify signature
	verified := false
	switch key := pubKey.(type) {
	case *ecdsa.PublicKey:
		hash := sha256.Sum256(signedData)
		verified = ecdsa.VerifyASN1(key, hash[:], signatureBytes)
	case *rsa.PublicKey:
		hash := sha256.Sum256(signedData)
		err := rsa.VerifyPKCS1v15(key, crypto.SHA256, hash[:], signatureBytes)
		verified = (err == nil)
	default:
		jsonError(w, "Unsupported key type", http.StatusInternalServerError)
		return
	}

	if !verified {
		jsonError(w, "Signature verification failed", http.StatusUnauthorized)
		return
	}

	// Update sign count and last_used_at
	now := nowDatetime()
	db.Exec("UPDATE passkeys SET sign_count = ?, last_used_at = ? WHERE id = ?", newSignCount, now, passkeyID)

	// Create JWT and return user info
	token, err := createJWT(userID)
	if err != nil {
		jsonError(w, "Failed to create token", http.StatusInternalServerError)
		return
	}

	var user User
	db.QueryRow("SELECT id, username, created_at FROM users WHERE id = ?", userID).Scan(&user.ID, &user.Username, &user.CreatedAt)

	jsonOK(w, map[string]interface{}{"token": token, "user": user})
}

// --- List Passkeys ---

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

	type PasskeyInfo struct {
		ID         int64   `json:"id"`
		Name       string  `json:"name"`
		CreatedAt  string  `json:"created_at"`
		LastUsedAt *string `json:"last_used_at"`
	}

	passkeys := []PasskeyInfo{}
	for rows.Next() {
		var p PasskeyInfo
		rows.Scan(&p.ID, &p.Name, &p.CreatedAt, &p.LastUsedAt)
		passkeys = append(passkeys, p)
	}

	jsonOK(w, map[string]interface{}{"passkeys": passkeys})
}

// --- Delete Passkey ---

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

	jsonOK(w, map[string]string{"message": "Passkey deleted"})
}

// --- Minimal CBOR Parser ---
// Supports the subset needed for WebAuthn attestation objects and COSE keys:
// - Maps (major type 5)
// - Byte strings (major type 2)
// - Text strings (major type 3)
// - Unsigned integers (major type 0)
// - Negative integers (major type 1)
// - Simple values / booleans (major type 7)
// - Arrays (major type 4)

type cborReader struct {
	data []byte
	pos  int
}

func newCBORReader(data []byte) *cborReader {
	return &cborReader{data: data, pos: 0}
}

func (r *cborReader) remaining() int {
	return len(r.data) - r.pos
}

func (r *cborReader) readByte() (byte, error) {
	if r.pos >= len(r.data) {
		return 0, errors.New("cbor: unexpected end of data")
	}
	b := r.data[r.pos]
	r.pos++
	return b, nil
}

func (r *cborReader) readBytes(n int) ([]byte, error) {
	if r.pos+n > len(r.data) {
		return nil, errors.New("cbor: unexpected end of data")
	}
	b := r.data[r.pos : r.pos+n]
	r.pos += n
	return b, nil
}

func (r *cborReader) readArgument(additional byte) (uint64, error) {
	if additional < 24 {
		return uint64(additional), nil
	}
	switch additional {
	case 24:
		b, err := r.readByte()
		if err != nil {
			return 0, err
		}
		return uint64(b), nil
	case 25:
		bs, err := r.readBytes(2)
		if err != nil {
			return 0, err
		}
		return uint64(binary.BigEndian.Uint16(bs)), nil
	case 26:
		bs, err := r.readBytes(4)
		if err != nil {
			return 0, err
		}
		return uint64(binary.BigEndian.Uint32(bs)), nil
	case 27:
		bs, err := r.readBytes(8)
		if err != nil {
			return 0, err
		}
		return binary.BigEndian.Uint64(bs), nil
	default:
		return 0, fmt.Errorf("cbor: unsupported additional info %d", additional)
	}
}

func (r *cborReader) readItem() (interface{}, error) {
	initial, err := r.readByte()
	if err != nil {
		return nil, err
	}

	major := initial >> 5
	additional := initial & 0x1f

	switch major {
	case 0: // Unsigned integer
		val, err := r.readArgument(additional)
		if err != nil {
			return nil, err
		}
		return int64(val), nil

	case 1: // Negative integer
		val, err := r.readArgument(additional)
		if err != nil {
			return nil, err
		}
		return int64(-1) - int64(val), nil

	case 2: // Byte string
		length, err := r.readArgument(additional)
		if err != nil {
			return nil, err
		}
		bs, err := r.readBytes(int(length))
		if err != nil {
			return nil, err
		}
		// Make a copy to avoid referencing underlying array
		copy := make([]byte, len(bs))
		for i := range bs {
			copy[i] = bs[i]
		}
		return copy, nil

	case 3: // Text string
		length, err := r.readArgument(additional)
		if err != nil {
			return nil, err
		}
		bs, err := r.readBytes(int(length))
		if err != nil {
			return nil, err
		}
		return string(bs), nil

	case 4: // Array
		length, err := r.readArgument(additional)
		if err != nil {
			return nil, err
		}
		arr := make([]interface{}, 0, int(length))
		for i := uint64(0); i < length; i++ {
			item, err := r.readItem()
			if err != nil {
				return nil, err
			}
			arr = append(arr, item)
		}
		return arr, nil

	case 5: // Map
		length, err := r.readArgument(additional)
		if err != nil {
			return nil, err
		}
		m := make(map[interface{}]interface{}, int(length))
		for i := uint64(0); i < length; i++ {
			key, err := r.readItem()
			if err != nil {
				return nil, err
			}
			val, err := r.readItem()
			if err != nil {
				return nil, err
			}
			m[key] = val
		}
		return m, nil

	case 7: // Simple values and floats
		switch additional {
		case 20:
			return false, nil
		case 21:
			return true, nil
		case 22:
			return nil, nil
		default:
			// Skip floats and other simple values
			if additional == 25 {
				_, err := r.readBytes(2)
				return nil, err
			} else if additional == 26 {
				_, err := r.readBytes(4)
				return nil, err
			} else if additional == 27 {
				_, err := r.readBytes(8)
				return nil, err
			}
			return int64(additional), nil
		}

	default:
		return nil, fmt.Errorf("cbor: unsupported major type %d", major)
	}
}

// parseCBORMap parses CBOR data and returns a map with string/int keys normalized to a common format.
// For WebAuthn, attestation object keys are strings, COSE key labels are integers.
func parseCBORMap(data []byte) (map[interface{}]interface{}, error) {
	reader := newCBORReader(data)
	item, err := reader.readItem()
	if err != nil {
		return nil, err
	}
	m, ok := item.(map[interface{}]interface{})
	if !ok {
		return nil, errors.New("cbor: expected map at top level")
	}
	return m, nil
}

// --- Minimal CBOR Encoder (for storing COSE keys) ---

func cborEncodeUint(major byte, val uint64) []byte {
	majorShifted := major << 5
	if val < 24 {
		return []byte{majorShifted | byte(val)}
	} else if val <= 0xff {
		return []byte{majorShifted | 24, byte(val)}
	} else if val <= 0xffff {
		buf := make([]byte, 3)
		buf[0] = majorShifted | 25
		binary.BigEndian.PutUint16(buf[1:], uint16(val))
		return buf
	} else if val <= 0xffffffff {
		buf := make([]byte, 5)
		buf[0] = majorShifted | 26
		binary.BigEndian.PutUint32(buf[1:], uint32(val))
		return buf
	}
	buf := make([]byte, 9)
	buf[0] = majorShifted | 27
	binary.BigEndian.PutUint64(buf[1:], val)
	return buf
}

func cborEncodeInt(val int64) []byte {
	if val >= 0 {
		return cborEncodeUint(0, uint64(val))
	}
	// Negative: encode as major type 1, value = -1 - val
	return cborEncodeUint(1, uint64(-1-val))
}

func cborEncodeByteString(data []byte) []byte {
	header := cborEncodeUint(2, uint64(len(data)))
	return append(header, data...)
}

func cborEncodeTextString(s string) []byte {
	header := cborEncodeUint(3, uint64(len(s)))
	return append(header, []byte(s)...)
}

func cborEncodeItem(val interface{}) ([]byte, error) {
	switch v := val.(type) {
	case int64:
		return cborEncodeInt(v), nil
	case int:
		return cborEncodeInt(int64(v)), nil
	case uint64:
		return cborEncodeUint(0, v), nil
	case []byte:
		return cborEncodeByteString(v), nil
	case string:
		return cborEncodeTextString(v), nil
	case bool:
		if v {
			return []byte{0xf5}, nil // true
		}
		return []byte{0xf4}, nil // false
	case nil:
		return []byte{0xf6}, nil // null
	case map[interface{}]interface{}:
		return cborEncodeMap(v)
	case []interface{}:
		header := cborEncodeUint(4, uint64(len(v)))
		for _, item := range v {
			encoded, err := cborEncodeItem(item)
			if err != nil {
				return nil, err
			}
			header = append(header, encoded...)
		}
		return header, nil
	default:
		return nil, fmt.Errorf("cbor encode: unsupported type %T", val)
	}
}

func cborEncodeMap(m map[interface{}]interface{}) ([]byte, error) {
	header := cborEncodeUint(5, uint64(len(m)))
	for k, v := range m {
		kEncoded, err := cborEncodeItem(k)
		if err != nil {
			return nil, err
		}
		vEncoded, err := cborEncodeItem(v)
		if err != nil {
			return nil, err
		}
		header = append(header, kEncoded...)
		header = append(header, vEncoded...)
	}
	return header, nil
}

func marshalCOSEKey(coseKey map[interface{}]interface{}) ([]byte, error) {
	return cborEncodeMap(coseKey)
}

// --- COSE Key Parsing ---

// COSE key labels
const (
	coseKeyLabelKty int64 = 1
	coseKeyLabelAlg int64 = 3
	coseKeyLabelCrv int64 = -1
	coseKeyLabelX   int64 = -2
	coseKeyLabelY   int64 = -3
	coseKeyLabelN   int64 = -1 // RSA modulus
	coseKeyLabelE   int64 = -2 // RSA exponent
)

// COSE key types
const (
	coseKtyEC2 int64 = 2 // Elliptic Curve with x,y
	coseKtyRSA int64 = 3 // RSA
)

// COSE algorithms
const (
	coseAlgES256 int64 = -7
	coseAlgRS256 int64 = -257
)

func getCOSEIntKey(m map[interface{}]interface{}, key int64) (int64, bool) {
	val, ok := m[key]
	if !ok {
		return 0, false
	}
	switch v := val.(type) {
	case int64:
		return v, true
	case int:
		return int64(v), true
	case uint64:
		return int64(v), true
	default:
		return 0, false
	}
}

func getCOSEBytesKey(m map[interface{}]interface{}, key int64) ([]byte, bool) {
	val, ok := m[key]
	if !ok {
		return nil, false
	}
	bs, ok := val.([]byte)
	return bs, ok
}

func parseCOSEPublicKey(coseKey map[interface{}]interface{}) (interface{}, error) {
	kty, ok := getCOSEIntKey(coseKey, coseKeyLabelKty)
	if !ok {
		return nil, errors.New("missing key type (kty)")
	}

	switch kty {
	case coseKtyEC2:
		return parseCOSEEC2Key(coseKey)
	case coseKtyRSA:
		return parseCOSERSAKey(coseKey)
	default:
		return nil, fmt.Errorf("unsupported key type: %d", kty)
	}
}

func parseCOSEEC2Key(coseKey map[interface{}]interface{}) (*ecdsa.PublicKey, error) {
	xBytes, ok := getCOSEBytesKey(coseKey, coseKeyLabelX)
	if !ok {
		return nil, errors.New("missing x coordinate")
	}
	yBytes, ok := getCOSEBytesKey(coseKey, coseKeyLabelY)
	if !ok {
		return nil, errors.New("missing y coordinate")
	}

	// Determine curve from crv parameter (default P-256 for ES256)
	curve := elliptic.P256()
	crv, hasCrv := getCOSEIntKey(coseKey, coseKeyLabelCrv)
	if hasCrv {
		switch crv {
		case 1: // P-256
			curve = elliptic.P256()
		case 2: // P-384
			curve = elliptic.P384()
		case 3: // P-521
			curve = elliptic.P521()
		default:
			return nil, fmt.Errorf("unsupported curve: %d", crv)
		}
	}

	x := new(big.Int).SetBytes(xBytes)
	y := new(big.Int).SetBytes(yBytes)

	pubKey := &ecdsa.PublicKey{
		Curve: curve,
		X:     x,
		Y:     y,
	}

	// Validate the point is on the curve
	if !curve.IsOnCurve(x, y) {
		return nil, errors.New("EC point is not on the curve")
	}

	return pubKey, nil
}

func parseCOSERSAKey(coseKey map[interface{}]interface{}) (*rsa.PublicKey, error) {
	// For RSA, n is at label -1, e is at label -2
	nBytes, ok := getCOSEBytesKey(coseKey, int64(-1)) // n
	if !ok {
		return nil, errors.New("missing RSA modulus (n)")
	}
	eBytes, ok := getCOSEBytesKey(coseKey, int64(-2)) // e
	if !ok {
		return nil, errors.New("missing RSA exponent (e)")
	}

	n := new(big.Int).SetBytes(nBytes)
	e := new(big.Int).SetBytes(eBytes)

	if !e.IsInt64() || e.Int64() > int64(1<<31-1) {
		return nil, errors.New("RSA exponent too large")
	}

	pubKey := &rsa.PublicKey{
		N: n,
		E: int(e.Int64()),
	}

	return pubKey, nil
}

// --- Utility ---

func bytesEqual(a, b []byte) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
