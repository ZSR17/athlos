// Athlos used to be an installable app whose service worker cached it. Browsers that still have it
// fetch this file when they check for an update: it clears the caches, removes itself and reloads
// the open pages, which then load the plain web app.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) await caches.delete(key);
      await self.registration.unregister();
      for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url);
    })(),
  );
});
