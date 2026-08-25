/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { CacheFirst } from 'workbox-strategies'

declare let self: ServiceWorkerGlobalScope

const isServiceWorkerUpdate = Boolean(self.registration.active)

self.skipWaiting()
clientsClaim()

self.addEventListener('activate', (event: ExtendableEvent) => {
  if (!isServiceWorkerUpdate)
    return

  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    await Promise.all(clients.map(async (client) => {
      if (new URL(client.url).origin !== self.location.origin)
        return
      await (client as WindowClient).navigate(client.url)
    }))
  })())
})

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close()

  const data = (event.notification.data ?? {}) as {
    reminderId?: string
    occurrenceId?: string
  }
  const action = event.action || 'open'
  const target = new URL('/', self.location.origin)
  target.searchParams.set('reminderAction', action)
  if (data.reminderId) target.searchParams.set('reminderId', data.reminderId)
  if (data.occurrenceId) target.searchParams.set('occurrenceId', data.occurrenceId)

  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const existing = clients.find((client) => new URL(client.url).origin === self.location.origin) as WindowClient | undefined
    if (existing) {
      const navigated = await existing.navigate(target.toString())
      await (navigated ?? existing).focus()
      return
    }
    await self.clients.openWindow(target.toString())
  })())
})

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

registerRoute(
  ({ request, url }) => (
    url.origin === self.location.origin
    && url.pathname.startsWith('/assets/WHOChart-')
    && (request.destination === 'script' || request.destination === 'style')
  ),
  new CacheFirst({ cacheName: 'babygrowth-runtime-who-chart' }),
)

registerRoute(
  ({ request, url }) => request.destination === 'image' && url.origin === self.location.origin,
  new CacheFirst({ cacheName: 'babygrowth-runtime-images' }),
)

/** @type {RegExp[] | undefined} */
let allowlist
if (import.meta.env.DEV)
  allowlist = [/^\/$/]

registerRoute(new NavigationRoute(
  createHandlerBoundToURL('index.html'),
  { allowlist },
))
