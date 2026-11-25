// watchdog service worker. Generated into dist/sw.js by scripts/build-sw.ts, which fills in the
// placeholders below. Same-origin only: other origins (the opt-in OSV.dev check) are never touched.
const VERSION = '__VERSION__'
const SHELL = `wd-shell-${VERSION}`
const DATA = 'wd-data'
const BASE = '__BASE__'
const PRECACHE = /*PRECACHE*/ []

self.addEventListener('install', event => {
  // No skipWaiting here: the page decides when to switch, so a reload never swaps code under the user.
  event.waitUntil(caches.open(SHELL).then(c => c.addAll(PRECACHE)))
})

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys())
        if (key.startsWith('wd-shell-') && key !== SHELL) await caches.delete(key)
      await self.clients.claim()
    })(),
  )
})

// Static servers may send Vary headers that would make a cached asset miss for a differently-shaped request.
const MATCH = { cacheName: SHELL, ignoreVary: true }

const isData = url => url.pathname.startsWith(`${BASE}data/`) || url.pathname === `${BASE}feed.xml`

/** Network first, so a Sweep shows up as soon as it is published; the last copy answers when offline. */
async function networkFirst(request) {
  const cache = await caches.open(DATA)
  try {
    const res = await fetch(request, { cache: 'no-cache' })
    if (res.ok) cache.put(request, res.clone())
    return res
  } catch {
    const hit = await cache.match(request)
    if (!hit) return new Response('offline', { status: 503, statusText: 'offline' })
    const headers = new Headers(hit.headers)
    headers.set('x-wd-cache', 'hit')
    return new Response(hit.body, { status: hit.status, statusText: hit.statusText, headers })
  }
}

self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (isData(url)) return event.respondWith(networkFirst(request))
  if (request.mode === 'navigate') {
    return event.respondWith(caches.match(`${BASE}`, MATCH).then(r => r ?? fetch(request)))
  }
  event.respondWith(
    caches.match(request, MATCH).then(
      hit =>
        hit ??
        fetch(request).then(res => {
          if (res.ok) caches.open(SHELL).then(c => c.put(request, res.clone()))
          return res
        }),
    ),
  )
})
