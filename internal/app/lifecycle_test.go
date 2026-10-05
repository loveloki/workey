package app

import "testing"

func TestBackgroundWorkersLifecycle(t *testing.T) {
	t.Run("未启动亦可安全停止", func(t *testing.T) {
		manager := NewSyncManager()
		notifier := NewNotifier()
		manager.Stop()
		manager.Stop()
		notifier.Stop()
		notifier.Stop()
	})
	t.Run("重复启动停止不会泄漏或 panic", func(t *testing.T) {
		manager := NewSyncManager()
		notifier := NewNotifier()
		manager.Start()
		manager.Start()
		notifier.Start()
		notifier.Start()
		manager.Stop()
		manager.Stop()
		notifier.Stop()
		notifier.Stop()
	})
}
