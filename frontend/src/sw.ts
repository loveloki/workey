/// <reference lib="WebWorker" />

import { precacheAndRoute } from 'workbox-precaching'

declare const self: ServiceWorkerGlobalScope

precacheAndRoute(self.__WB_MANIFEST)

self.addEventListener('push', (event) => {
  const data = event.data?.text() || '该下班了'
  event.waitUntil(
    self.registration.showNotification('Workey', {
      body: data,
      icon: '/logo192.png',
      badge: '/logo192.png',
      tag: 'clock-out-reminder',
      data: { url: '/clock' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    self.clients.openWindow(url),
  )
})
