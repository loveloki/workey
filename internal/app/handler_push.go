package app

import (
	"encoding/json"
	"net/http"
)

func handleVapidKey(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	jsonOK(w, VapidKeyResponse{PublicKey: getVAPIDPublicKey()})
}

func handlePushSubscribe(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)

	switch r.Method {
	case "POST":
		var req PushSubscribeRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			jsonError(w, "Invalid request body", http.StatusBadRequest)
			return
		}
		if req.Endpoint == "" || req.P256dh == "" || req.Auth == "" {
			jsonError(w, "Missing required fields", http.StatusBadRequest)
			return
		}
		_, err := db.Exec(
			"INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth",
			userID, req.Endpoint, req.P256dh, req.Auth,
		)
		if err != nil {
			jsonError(w, "Failed to save subscription", http.StatusInternalServerError)
			return
		}
		jsonOK(w, MessageResponse{Message: "ok"})

	case "DELETE":
		var req struct {
			Endpoint string `json:"endpoint"`
		}
		if r.Body != nil {
			json.NewDecoder(r.Body).Decode(&req)
		}
		if req.Endpoint != "" {
			db.Exec("DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?", userID, req.Endpoint)
		} else {
			db.Exec("DELETE FROM push_subscriptions WHERE user_id = ?", userID)
		}
		jsonOK(w, MessageResponse{Message: "ok"})

	default:
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}
