/// <reference lib="WebWorker" />

import { precacheAndRoute } from 'workbox-precaching'

declare const self: ServiceWorkerGlobalScope

precacheAndRoute(self.__WB_MANIFEST)

// 监听来自客户端的 SKIP_WAITING 消息，允许新 SW 跳过等待阶段立即激活
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})
