// Imported into the generated service worker (vite.config.ts `workbox.importScripts`): clicking
// a notification shown through the service worker focuses the app window (or opens it).
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const win = windows.find((w) => 'focus' in w)
      return win ? win.focus() : self.clients.openWindow(self.registration.scope)
    }),
  )
})
