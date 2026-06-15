import { useState, useEffect, useCallback } from 'react'
import { push as pushApi } from './api'

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>(
    () => 'Notification' in window ? Notification.permission : 'denied',
  )
  const [subscribed, setSubscribed] = useState(false)
  const [loading, setLoading] = useState(false)

  const getExistingSubscription = useCallback(async (): Promise<PushSubscription | null> => {
    try {
      const reg = await navigator.serviceWorker.ready
      return await reg.pushManager.getSubscription()
    } catch {
      return null
    }
  }, [])

  const checkSubscription = useCallback(async () => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return
    const sub = await getExistingSubscription()
    setSubscribed(!!sub)
  }, [getExistingSubscription])

  useEffect(() => {
    checkSubscription()
  }, [checkSubscription])

  const subscribe = useCallback(async () => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return
    setLoading(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const existing = await reg.pushManager.getSubscription()
      if (existing) {
        await existing.unsubscribe()
      }

      const { public_key } = await pushApi.getVapidKey()
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: public_key,
      })

      const json = sub.toJSON()
      await pushApi.subscribe({
        endpoint: json.endpoint!,
        p256dh: json.keys!.p256dh,
        auth: json.keys!.auth,
      })

      setSubscribed(true)
      setPermission('granted')
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'NotAllowedError') {
        setPermission('denied')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const unsubscribe = useCallback(async () => {
    setLoading(true)
    try {
      const sub = await getExistingSubscription()
      if (sub) {
        const json = sub.toJSON()
        await pushApi.unsubscribe(json.endpoint!)
        await sub.unsubscribe()
      }
      setSubscribed(false)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [getExistingSubscription])

  return { permission, subscribed, loading, subscribe, unsubscribe }
}
