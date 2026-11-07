/// <reference lib="webworker" />
// Service worker (ARCHITECTURE §9): precache the shell, network-first API, cache-first thumbnails, push.
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

declare const self: ServiceWorkerGlobalScope

self.skipWaiting()
self.addEventListener('activate', () => self.clients.claim())

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')))

registerRoute(({ url }) => url.pathname.startsWith('/v1/'), new NetworkFirst({ cacheName: 'api', networkTimeoutSeconds: 5 }))
registerRoute(
  ({ url, request }) => request.destination === 'image' && (url.pathname.includes('/storage/v1/') || url.pathname.startsWith('/seed/')),
  new CacheFirst({ cacheName: 'thumbs', plugins: [new ExpirationPlugin({ maxAgeSeconds: 7 * 86400, maxEntries: 300 })] }),
)
registerRoute(({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com', new StaleWhileRevalidate({ cacheName: 'fonts' }))

self.addEventListener('push', (event) => {
  const data = (() => {
    try {
      return event.data?.json() ?? {}
    } catch {
      return { body: event.data?.text() }
    }
  })() as { title?: string; body?: string; claim_id?: string; url?: string }
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Gumsum', {
      body: data.body ?? 'Your request was updated.',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url ?? (data.claim_id ? `/requests/${data.claim_id}` : '/requests') },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data as { url: string }).url
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const existing = list.find((c) => 'focus' in c) as WindowClient | undefined
      if (existing) return existing.navigate(url).then((c) => c?.focus())
      return self.clients.openWindow(url)
    }),
  )
})
