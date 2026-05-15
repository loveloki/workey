package app

import (
	"encoding/json"
	"net/http"
)

// 经验教训 handler

func handleLessons(w http.ResponseWriter, r *http.Request) {
	if r.Method == "POST" {
		handleLessonCreate(w, r)
		return
	}
	jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
}

func handleLessonCreate(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)

	var req struct {
		Date    string `json:"date"`
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Date == "" {
		req.Date = today()
	}

	now := nowDatetime()

	result, err := db.Exec(
		"UPDATE lessons SET content = ?, updated_at = ? WHERE user_id = ? AND date = ?",
		req.Content, now, userID, req.Date,
	)
	if err != nil {
		jsonError(w, "Internal error", http.StatusInternalServerError)
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		_, err = db.Exec(
			"INSERT INTO lessons (user_id, date, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
			userID, req.Date, req.Content, now, now,
		)
		if err != nil {
			jsonError(w, "Internal error", http.StatusInternalServerError)
			return
		}
	}

	lesson := getLesson(userID, req.Date)
	jsonOK(w, LessonResponse{Lesson: lesson})
}

func handleLessonToday(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserID(r)
	lesson := getLesson(userID, today())
	if lesson == nil {
		jsonOK(w, LessonResponse{})
		return
	}
	jsonOK(w, LessonResponse{Lesson: lesson})
}

func handleLessonRange(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserID(r)
	start := r.URL.Query().Get("start")
	end := r.URL.Query().Get("end")
	if start == "" || end == "" {
		jsonError(w, "start and end query parameters are required", http.StatusBadRequest)
		return
	}

	rows, err := db.Query(
		"SELECT id, user_id, date, content, created_at, updated_at FROM lessons WHERE user_id = ? AND date >= ? AND date <= ? ORDER BY date",
		userID, start, end,
	)
	if err != nil {
		jsonError(w, "Internal error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	lessons := []Lesson{}
	for rows.Next() {
		var l Lesson
		rows.Scan(&l.ID, &l.UserID, &l.Date, &l.Content, &l.CreatedAt, &l.UpdatedAt)
		lessons = append(lessons, l)
	}
	jsonOK(w, LessonListResponse{Lessons: lessons})
}

func getLesson(userID int64, date string) *Lesson {
	var l Lesson
	err := db.QueryRow(
		"SELECT id, user_id, date, content, created_at, updated_at FROM lessons WHERE user_id = ? AND date = ?",
		userID, date,
	).Scan(&l.ID, &l.UserID, &l.Date, &l.Content, &l.CreatedAt, &l.UpdatedAt)
	if err != nil {
		return nil
	}
	return &l
}
