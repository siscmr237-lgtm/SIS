/**
 * The service worker. Its ONLY job is to have something to show when a
 * navigation fails because the device is offline.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not cache pages, API responses,
 * scripts or styles. This is a school's live record of students, fees and
 * attendance: a stale figure served confidently from a cache is worse than no
 * figure at all, because nothing on screen would say it was stale. So every
 * request goes to the network, every time, and the cache is consulted only
 * after the network has actually failed.
 *
 * That restraint is also why there is no version-bump ritual to remember here.
 * The only cached entries are the offline page and the logo on it, so a deploy
 * cannot leave a user pinned to old application code.
 */

/**
 * Bump this when the offline page's contents change, so the new copy replaces
 * the old one instead of sitting behind it. Nothing else is keyed on it.
 */
const CACHE = 'lewa-offline-v1';

const OFFLINE_URL = '/offline';

/**
 * The logo the offline page shows. Cached alongside the page because the page
 * is no use half-loaded: served from the cache with the network down, an
 * uncached <img> is a broken-image icon above the message, which reads as a
 * broken app rather than a missing connection.
 *
 * It is the one asset that gets this treatment. It never changes without the
 * cache name changing with it, so there is no staleness to trade away.
 */
const OFFLINE_ASSETS = [OFFLINE_URL, '/images/lewa-logo.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // `cache: 'reload'` so the install reads from the network rather than
      // from whatever the HTTP cache happens to be holding -- otherwise a
      // fresh worker can install a copy of the offline page older than itself.
      await cache.addAll(OFFLINE_ASSETS.map((url) => new Request(url, { cache: 'reload' })));
    })(),
  );

  // Takes over without waiting for every tab to close. Safe here in a way it
  // would not be for a worker that served application code: this one only ever
  // adds a fallback to failed navigations, so an old tab meeting a new worker
  // sees no change in behaviour.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drops caches from earlier versions of this file, including any left by
      // a previous CACHE name.
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const isNavigation = event.request.mode === 'navigate';

  /**
   * The logo, and only the logo, is intercepted alongside navigations.
   *
   * Caching it at install was pointless without this: a handler that only
   * answered navigations left the offline page's own <img> going to the dead
   * network, so the page arrived from cache with a broken-image icon above the
   * message -- which reads as a broken app rather than a missing connection.
   * The cache entry existed and was never consulted.
   *
   * Everything else is still left entirely alone: API calls, scripts, styles
   * and the data requests behind in-app navigation are not intercepted, not
   * cached, not even observed.
   */
  const url = new URL(event.request.url);
  const isOfflineAsset =
    url.origin === self.location.origin && OFFLINE_ASSETS.includes(url.pathname);

  /**
   * The honest limit of intercepting only navigations: once the app is open,
   * moving between pages is a data request rather than a navigation, so it
   * fails the way it does today, with the app's own error handling. This worker
   * catches the case someone actually hits with no signal -- opening the app,
   * or reloading it.
   */
  if (!isNavigation && !isOfflineAsset) return;

  event.respondWith(
    (async () => {
      try {
        // Network first, always, for both kinds -- so nothing here can serve a
        // stale copy of anything while the connection works.
        return await fetch(event.request);
      } catch {
        // Reached only when the network could not be used at all. An HTTP
        // error is a response, so it is returned above untouched -- a 500 from
        // the server must not be dressed up as being offline.
        //
        // A failed navigation falls back to the offline page; a failed request
        // for one of the offline assets falls back to that asset.
        const cached = await caches.match(isNavigation ? OFFLINE_URL : event.request, {
          // The entries were stored under plain GETs at install time. Nothing
          // is served under a Vary here, but if the host ever adds one, a
          // mismatch would silently turn this fallback back into a broken
          // image.
          ignoreVary: true,
        });
        return (
          cached ??
          new Response('You are offline.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          })
        );
      }
    })(),
  );
});

/**
 * PUSH NOTIFICATIONS.
 *
 * Separate from everything above, and deliberately so. The fetch handler exists
 * to show an offline page and caches almost nothing; these two listeners are
 * about a message arriving while no tab is open at all. They share this file
 * because a page may only have ONE service worker per scope, not because they
 * are related.
 *
 * The payload is written by src/utils/pushNotification.js on the backend and is
 * always { title, body, url }.
 */
self.addEventListener('push', (event) => {
  // A push with no body is legal — some services send one to wake a worker — and
  // event.data.json() throws on it, which would reject the whole handler and be
  // reported as a failed push. Nothing to show, so nothing is shown.
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    // Not our payload. Better to say nothing than to show a notification whose
    // text is a fragment of JSON.
    return;
  }

  // waitUntil is load-bearing, not decoration: showNotification returns a
  // promise, and without this the worker may be killed before the notification
  // is actually posted, so it silently never appears.
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // The URL the backend attached, or the app root. A missing url must not become
  // a navigation to the string "undefined", which is what openWindow(undefined)
  // produces.
  const target = event.notification.data?.url || '/';

  event.waitUntil(
    (async () => {
      // FOCUS AN OPEN TAB BEFORE OPENING A NEW ONE. Without this, every tap
      // opens another copy of the app, and someone who reads three reminders
      // ends up with three tabs of the same dashboard. includeUncontrolled
      // catches tabs loaded before this worker took over.
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        // Same-origin only, and compared on pathname so a tab already on the
        // target page is focused rather than navigated to where it already is.
        const url = new URL(client.url);
        if (url.origin === self.location.origin && url.pathname === target) {
          return client.focus();
        }
      }

      // A tab is open, but not on the right page: move it rather than opening a
      // second one. navigate() can be refused (a cross-origin tab, a client the
      // browser will not let us steer), and the fallback below is the answer.
      const sameOrigin = windows.find((c) => new URL(c.url).origin === self.location.origin);
      if (sameOrigin && 'navigate' in sameOrigin) {
        try {
          const navigated = await sameOrigin.navigate(target);
          if (navigated) return navigated.focus();
        } catch {
          // Fall through to openWindow.
        }
      }

      return self.clients.openWindow(target);
    })(),
  );
});
