/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { CacheFirst } from 'workbox-strategies'
import { createDriveMediaStreamRegistry } from '@/driveMediaStreamWorker'
import {
  driveMediaStreamIdFromPath,
  parseDriveMediaStreamMessage,
  type DriveMediaStreamReply,
} from '@/features/sync/driveMediaStreamProtocol'

declare let self: ServiceWorkerGlobalScope

const isServiceWorkerUpdate = Boolean(self.registration.active)
const driveMediaStreams = createDriveMediaStreamRegistry({ fetch })

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

self.addEventListener('message', (event: ExtendableMessageEvent) => {
  const message = parseDriveMediaStreamMessage(event.data)
  if (!message)
    return

  if (message.kind === 'drive-media-stream/unregister') {
    driveMediaStreams.unregister(message.streamId)
    return
  }

  const reply: DriveMediaStreamReply = message.expiresAt > Date.now()
    ? { kind: 'drive-media-stream/registered' }
    : { kind: 'drive-media-stream/error', message: 'Phiên Google Drive đã hết hạn.' }
  if (reply.kind === 'drive-media-stream/registered')
    driveMediaStreams.register(message)
  event.ports[0]?.postMessage(reply)
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

registerRoute(
  ({ request, url }) => (
    request.method === 'GET'
    && url.origin === self.location.origin
    && driveMediaStreamIdFromPath(url.pathname) !== null
  ),
  ({ request, url }) => {
    const streamId = driveMediaStreamIdFromPath(url.pathname)
    return streamId
      ? driveMediaStreams.respond(request, streamId)
      : Promise.resolve(new Response('Stream không hợp lệ.', { status: 404 }))
  },
)

/** @type {RegExp[] | undefined} */
let allowlist
if (import.meta.env.DEV)
  allowlist = [/^\/$/]

registerRoute(new NavigationRoute(
  createHandlerBoundToURL('index.html'),
  { allowlist },
))
