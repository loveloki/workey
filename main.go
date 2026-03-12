package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	_ "modernc.org/sqlite"
)

var db *sql.DB
var jwtSecret []byte

func main() {
	dbPath := os.Getenv("WORKEY_DB")
	if dbPath == "" {
		dbPath = "workey.db"
	}

	var err error
	db, err = sql.Open("sqlite", dbPath)
	if err != nil {
		log.Fatal("Failed to open database:", err)
	}
	defer db.Close()

	// Enable WAL mode and foreign keys
	db.Exec("PRAGMA journal_mode=WAL")
	db.Exec("PRAGMA foreign_keys=ON")

	initDB()
	jwtSecret = getOrCreateJWTSecret()

	mux := http.NewServeMux()

	// Auth routes
	mux.HandleFunc("/api/auth/register", corsMiddleware(handleRegister))
	mux.HandleFunc("/api/auth/login", corsMiddleware(handleLogin))
	mux.HandleFunc("/api/auth/me", corsMiddleware(authMiddleware(handleMe)))

	// Attendance routes
	mux.HandleFunc("/api/attendance/clock-in", corsMiddleware(authMiddleware(handleClockIn)))
	mux.HandleFunc("/api/attendance/clock-out", corsMiddleware(authMiddleware(handleClockOut)))
	mux.HandleFunc("/api/attendance/today", corsMiddleware(authMiddleware(handleAttendanceToday)))
	mux.HandleFunc("/api/attendance/range", corsMiddleware(authMiddleware(handleAttendanceRange)))

	// Work log routes
	mux.HandleFunc("/api/work-logs", corsMiddleware(authMiddleware(handleWorkLogs)))
	mux.HandleFunc("/api/work-logs/today", corsMiddleware(authMiddleware(handleWorkLogToday)))
	mux.HandleFunc("/api/work-logs/range", corsMiddleware(authMiddleware(handleWorkLogRange)))

	// Settings routes
	mux.HandleFunc("/api/auth/change-password", corsMiddleware(authMiddleware(handleChangePassword)))
	mux.HandleFunc("/api/settings", corsMiddleware(authMiddleware(handleSettings)))

	// Export/Import routes
	mux.HandleFunc("/api/data/export", corsMiddleware(authMiddleware(handleDataExport)))
	mux.HandleFunc("/api/data/import", corsMiddleware(authMiddleware(handleDataImport)))

	// SPA fallback: serve frontend
	mux.HandleFunc("/", handleSPA)

	log.Println("Server starting on :8000")
	if err := http.ListenAndServe(":8000", mux); err != nil {
		log.Fatal(err)
	}
}

func initDB() {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS settings (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS user_settings (
			user_id INTEGER NOT NULL,
			key TEXT NOT NULL,
			value TEXT NOT NULL,
			PRIMARY KEY(user_id, key),
			FOREIGN KEY(user_id) REFERENCES users(id)
		)`,
		`CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			username TEXT UNIQUE NOT NULL,
			password_hash TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS attendance (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL REFERENCES users(id),
			date TEXT NOT NULL,
			clock_in DATETIME,
			clock_out DATETIME,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(user_id, date)
		)`,
		`CREATE TABLE IF NOT EXISTS work_logs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL REFERENCES users(id),
			date TEXT NOT NULL,
			content TEXT NOT NULL DEFAULT '',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(user_id, date)
		)`,
	}
	for _, q := range queries {
		if _, err := db.Exec(q); err != nil {
			log.Fatalf("Failed to init DB: %v\nQuery: %s", err, q)
		}
	}
}

func getOrCreateJWTSecret() []byte {
	var secret string
	err := db.QueryRow("SELECT value FROM settings WHERE key='jwt_secret'").Scan(&secret)
	if err == sql.ErrNoRows {
		secret = generateRandomString(64)
		db.Exec("INSERT INTO settings (key, value) VALUES ('jwt_secret', ?)", secret)
	} else if err != nil {
		log.Fatal("Failed to get JWT secret:", err)
	}
	return []byte(secret)
}

// --- SPA handler ---

func handleSPA(w http.ResponseWriter, r *http.Request) {
	distDir := "./frontend/dist"

	// Try to serve the exact file
	path := filepath.Join(distDir, filepath.Clean(r.URL.Path))

	// Check if file exists
	info, err := os.Stat(path)
	if err == nil && !info.IsDir() {
		http.ServeFile(w, r, path)
		return
	}

	// SPA fallback: serve index.html
	indexPath := filepath.Join(distDir, "index.html")
	if _, err := os.Stat(indexPath); err != nil {
		// No frontend built yet
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "api-only", "message": "Frontend not built. API available at /api/"})
		return
	}
	http.ServeFile(w, r, indexPath)
}

// --- Middleware ---

func corsMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		next(w, r)
	}
}

type contextKey string

func authMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		auth := r.Header.Get("Authorization")
		if !strings.HasPrefix(auth, "Bearer ") {
			jsonError(w, "Missing or invalid authorization header", http.StatusUnauthorized)
			return
		}
		token := strings.TrimPrefix(auth, "Bearer ")
		userID, err := validateJWT(token)
		if err != nil {
			jsonError(w, "Invalid or expired token", http.StatusUnauthorized)
			return
		}
		// Store user ID in header for simplicity (avoid context complexity)
		r.Header.Set("X-User-ID", fmt.Sprintf("%d", userID))
		next(w, r)
	}
}

// --- JSON helpers ---

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
	var id int64
	fmt.Sscanf(r.Header.Get("X-User-ID"), "%d", &id)
	return id
}
