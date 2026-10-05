package app

import (
	"database/sql"
	"log"
	"sync"
	"time"

	"github.com/SherClockHolmes/webpush-go"
)

const pushScanInterval = 1 * time.Minute
const maxRetryAttempts = 3

type Notifier struct {
	stopCh    chan struct{}
	startOnce sync.Once
	stopOnce  sync.Once
	workers   sync.WaitGroup
}

func NewNotifier() *Notifier {
	return &Notifier{
		stopCh: make(chan struct{}),
	}
}

func (n *Notifier) Start() {
	n.startOnce.Do(func() {
		n.workers.Add(1)
		go func() {
			defer n.workers.Done()
			n.loop()
		}()
		log.Println("[push] Notifier started (check interval: 1m)")
	})
}

func (n *Notifier) Stop() {
	n.stopOnce.Do(func() { close(n.stopCh) })
	n.workers.Wait()
}

func (n *Notifier) loop() {
	ticker := time.NewTicker(pushScanInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			n.processPending()
		case <-n.stopCh:
			return
		}
	}
}

func (n *Notifier) processPending() {
	rows, err := db.Query(
		"SELECT id, user_id, endpoint, p256dh, auth FROM push_subscriptions",
	)
	if err != nil {
		log.Printf("[push] Failed to query subscriptions: %v", err)
		return
	}
	defer rows.Close()

	subs := make(map[int64][]webpushSub)
	for rows.Next() {
		var s webpushSub
		if err := rows.Scan(&s.id, &s.userID, &s.endpoint, &s.p256dh, &s.auth); err != nil {
			log.Printf("[push] Failed to scan subscription: %v", err)
			continue
		}
		subs[s.userID] = append(subs[s.userID], s)
	}

	reminders, err := n.queryPending()
	if err != nil {
		return
	}

	for _, r := range reminders {
		userSubs, ok := subs[r.UserID]
		if !ok {
			continue
		}
		for _, s := range userSubs {
			n.sendPush(r, s)
		}
	}
}

type webpushSub struct {
	id       int64
	userID   int64
	endpoint string
	p256dh   string
	auth     string
}

func (n *Notifier) queryPending() ([]PendingReminder, error) {
	rows, err := db.Query(
		"SELECT id, user_id, send_at, attempts FROM pending_reminders WHERE send_at <= ? AND attempts < ?",
		nowDatetime(), maxRetryAttempts,
	)
	if err != nil {
		log.Printf("[push] Failed to query pending reminders: %v", err)
		return nil, err
	}
	defer rows.Close()

	var reminders []PendingReminder
	for rows.Next() {
		var r PendingReminder
		if err := rows.Scan(&r.ID, &r.UserID, &r.SendAt, &r.Attempts); err != nil {
			log.Printf("[push] Failed to scan reminder: %v", err)
			continue
		}
		reminders = append(reminders, r)
	}
	return reminders, nil
}

func (n *Notifier) sendPush(r PendingReminder, sub webpushSub) {
	vapidPublicKey, vapidPrivateKey := getOrCreateVAPIDKeys()

	s := &webpush.Subscription{
		Endpoint: sub.endpoint,
		Keys: webpush.Keys{
			P256dh: sub.p256dh,
			Auth:   sub.auth,
		},
	}

	resp, err := webpush.SendNotification([]byte("该下班了"), s, &webpush.Options{
		Subscriber:      "admin@workey.app",
		VAPIDPublicKey:  vapidPublicKey,
		VAPIDPrivateKey: vapidPrivateKey,
		TTL:             3600,
	})
	if err != nil {
		log.Printf("[push] Failed to send notification: %v", err)
		n.incrementAttempt(r.ID)
		return
	}
	defer resp.Body.Close()

	switch resp.StatusCode {
	case 201:
		n.removeReminder(r.ID)
	case 410:
		n.removeSubscription(sub.id)
		n.removeReminder(r.ID)
	default:
		log.Printf("[push] Unexpected status %d for reminder %d", resp.StatusCode, r.ID)
		n.incrementAttempt(r.ID)
	}
}

func (n *Notifier) removeReminder(id int64) {
	_, err := db.Exec("DELETE FROM pending_reminders WHERE id = ?", id)
	if err != nil {
		log.Printf("[push] Failed to delete reminder %d: %v", id, err)
	}
}

func (n *Notifier) removeSubscription(id int64) {
	_, err := db.Exec("DELETE FROM push_subscriptions WHERE id = ?", id)
	if err != nil {
		log.Printf("[push] Failed to delete subscription %d: %v", id, err)
	}
}

func (n *Notifier) incrementAttempt(id int64) {
	_, err := db.Exec("UPDATE pending_reminders SET attempts = attempts + 1 WHERE id = ?", id)
	if err != nil {
		log.Printf("[push] Failed to increment attempts for reminder %d: %v", id, err)
	}
}

func getOrCreateVAPIDKeys() (string, string) {
	var publicKey, privateKey string
	err := db.QueryRow("SELECT value FROM settings WHERE key='vapid_public'").Scan(&publicKey)
	if err != nil {
		privateKey = ""
	}
	err = db.QueryRow("SELECT value FROM settings WHERE key='vapid_private'").Scan(&privateKey)
	if err == sql.ErrNoRows {
		priv, pub, err := webpush.GenerateVAPIDKeys()
		if err != nil {
			log.Fatalf("Failed to generate VAPID keys: %v", err)
		}
		publicKey = pub
		privateKey = priv
		db.Exec("INSERT INTO settings (key, value) VALUES ('vapid_public', ?)", publicKey)
		db.Exec("INSERT INTO settings (key, value) VALUES ('vapid_private', ?)", privateKey)
	} else if err != nil {
		log.Fatalf("Failed to get VAPID keys: %v", err)
	}
	return publicKey, privateKey
}

func getVAPIDPublicKey() string {
	pub, _ := getOrCreateVAPIDKeys()
	return pub
}
