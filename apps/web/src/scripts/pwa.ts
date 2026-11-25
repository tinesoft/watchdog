/** Registers the service worker (production only) and tells the page when an update is waiting. */
export function registerServiceWorker(onUpdate: (apply: () => void) => void): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  const base = import.meta.env.BASE_URL
  navigator.serviceWorker
    .register(`${base}sw.js`, { scope: base })
    .then(reg => {
      const announce = (worker: ServiceWorker) =>
        onUpdate(() => {
          navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), {
            once: true,
          })
          worker.postMessage('SKIP_WAITING')
        })
      if (reg.waiting && navigator.serviceWorker.controller) announce(reg.waiting)
      reg.addEventListener('updatefound', () => {
        const w = reg.installing
        w?.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) announce(w)
        })
      })
    })
    .catch(() => {
      /* no service worker: the app still works online */
    })
}
