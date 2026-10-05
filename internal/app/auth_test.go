package app

import (
	"database/sql"
	"fmt"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCreateAccount(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	user, err := createAccount("accountuser", "password123")
	require.NoError(t, err)
	assert.Positive(t, user.ID)
	assert.Equal(t, "accountuser", user.Username)
	assert.NotEmpty(t, user.CreatedAt)

	record, err := accountForUser(user.ID)
	require.NoError(t, err)
	assert.Equal(t, accountCollectionName, record.Collection().Name)
	assert.Equal(t, user.Username, record.GetString("username"))
	profile, err := userForAccount(record)
	require.NoError(t, err)
	assert.Equal(t, user, profile)

	_, err = createAccount("accountuser", "differentpassword")
	assert.ErrorIs(t, err, errUsernameTaken)
	var count int
	require.NoError(t, db.QueryRow("SELECT COUNT(*) FROM workey_profiles").Scan(&count))
	assert.Equal(t, 1, count)
}

func TestCreateAccount_RollsBackRecordWhenMappingFails(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	_, err := db.Exec(`CREATE TRIGGER reject_test_profile BEFORE INSERT ON workey_profiles
		BEGIN SELECT RAISE(ABORT, 'profile write failed'); END`)
	require.NoError(t, err)
	user, err := createAccount("rollbackuser", "password123")
	require.Error(t, err)
	assert.ErrorContains(t, err, "profile write failed")
	assert.Zero(t, user.ID)

	_, err = pbApp.FindFirstRecordByData(accountCollectionName, "username", "rollbackuser")
	assert.ErrorIs(t, err, sql.ErrNoRows)
	var count int
	require.NoError(t, db.QueryRow("SELECT COUNT(*) FROM workey_profiles").Scan(&count))
	assert.Zero(t, count)
}

func TestValidateUserPassword(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := createTestUser(t, "passworduser", "correct-password")

	for _, password := range []string{"correct-password", "wrong-password", ""} {
		valid, err := validateUserPassword(userID, password)
		require.NoError(t, err)
		assert.Equal(t, password == "correct-password", valid)
	}
	valid, err := validateUserPassword(-1, "correct-password")
	assert.False(t, valid)
	assert.ErrorIs(t, err, sql.ErrNoRows)
}

func TestCreateAndValidateJWT(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := createTestUser(t, "tokenuser", "password123")

	token, err := createJWT(userID)
	require.NoError(t, err)
	assert.NotEmpty(t, token)

	record, err := pbApp.FindAuthRecordByToken(token, core.TokenTypeAuth)
	require.NoError(t, err)
	assert.Equal(t, accountCollectionName, record.Collection().Name)
	gotUserID, exp, err := validateJWT(token)
	require.NoError(t, err)
	assert.Equal(t, userID, gotUserID)
	assert.Greater(t, exp, time.Now().Unix())
}

func TestValidateJWT_InvalidToken(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	_, _, err := validateJWT("invalid.token.string")
	assert.ErrorIs(t, err, errInvalidToken)
}

func TestValidateJWT_IndependentOfWebDAVKey(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := createTestUser(t, "encryptionkeyuser", "password123")
	token, err := createJWT(userID)
	require.NoError(t, err)

	originalSecret := dataEncryptionSecret
	defer func() { dataEncryptionSecret = originalSecret }()
	dataEncryptionSecret = []byte("a-different-webdav-key")
	gotUserID, _, err := validateJWT(token)
	require.NoError(t, err)
	assert.Equal(t, userID, gotUserID)
}

func TestValidateJWT_DifferentUserIDs(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	for i := range 3 {
		id := createTestUser(t, fmt.Sprintf("tokenuser%d", i), "password123")
		token, err := createJWT(id)
		require.NoError(t, err)
		gotID, _, err := validateJWT(token)
		require.NoError(t, err)
		assert.Equal(t, id, gotID)
	}
}

func TestValidateJWT_PasswordChangeRevokesToken(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := createTestUser(t, "revocationuser", "oldpassword")
	token, err := createJWT(userID)
	require.NoError(t, err)
	record, err := accountForUser(userID)
	require.NoError(t, err)
	record.SetPassword("newpassword")
	require.NoError(t, pbApp.Save(record))

	_, _, err = validateJWT(token)
	assert.ErrorIs(t, err, errInvalidToken)
	_, err = pbApp.FindAuthRecordByToken(token, core.TokenTypeAuth)
	assert.Error(t, err)
	newToken, err := createJWT(userID)
	require.NoError(t, err)
	gotID, _, err := validateJWT(newToken)
	require.NoError(t, err)
	assert.Equal(t, userID, gotID)
}

func TestValidateJWT_RejectsOtherTokenTypes(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := createTestUser(t, "resetuser", "password123")
	record, err := accountForUser(userID)
	require.NoError(t, err)
	token, err := record.NewPasswordResetToken()
	require.NoError(t, err)
	_, _, err = validateJWT(token)
	assert.ErrorIs(t, err, errInvalidToken)
}

func TestCreateJWT_MissingProfile(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	_, err := createJWT(-1)
	assert.ErrorIs(t, err, sql.ErrNoRows)
}

func testSuperuserToken(t *testing.T) string {
	t.Helper()
	collection, err := pbApp.FindCollectionByNameOrId(core.CollectionNameSuperusers)
	require.NoError(t, err)
	record := core.NewRecord(collection)
	record.SetEmail("auth-test@example.com")
	record.SetPassword("superuser-password123")
	require.NoError(t, pbApp.Save(record))
	token, err := record.NewAuthToken()
	require.NoError(t, err)
	return token
}

func TestValidateJWT_RejectsSuperuser(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	token := testSuperuserToken(t)
	_, err := pbApp.FindAuthRecordByToken(token, core.TokenTypeAuth)
	require.NoError(t, err)
	_, _, err = validateJWT(token)
	assert.ErrorIs(t, err, errInvalidToken)
}

func TestGenerateRandomString(t *testing.T) {
	s1 := generateRandomString(32)
	s2 := generateRandomString(32)
	assert.Len(t, s1, 64)
	assert.Len(t, s2, 64)
	assert.NotEqual(t, s1, s2)
}
