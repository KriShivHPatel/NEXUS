// NEXUS service worker. Caches the application shell so it works offline after the first visit.
// Bump CACHE_VERSION whenever any cached file changes. Old caches are removed on activation.

const CACHE_VERSION = 'nexus-shell-v2';

const SHELL_ASSETS = [
  './',
  './index.html',
  './assets/icons/icon.svg',
  './css/base.css',
  './css/components.css',
  './css/dashboard.css',
  './css/layout.css',
  './css/modules.css',
  './js/actions.js',
  './js/app.js',
  './js/bus.js',
  './js/components/charts.js',
  './js/components/command-palette.js',
  './js/components/focus-engine.js',
  './js/components/focus-timer.js',
  './js/components/forms.js',
  './js/components/header.js',
  './js/components/modal.js',
  './js/components/notifications.js',
  './js/components/quick-capture.js',
  './js/components/sidebar.js',
  './js/components/task-form.js',
  './js/components/toast.js',
  './js/data.js',
  './js/database.js',
  './js/domain/academics.js',
  './js/domain/alerts.js',
  './js/domain/analytics.js',
  './js/domain/backup.js',
  './js/domain/constants.js',
  './js/domain/dates.js',
  './js/domain/layout.js',
  './js/domain/projects.js',
  './js/domain/recurrence.js',
  './js/domain/tasks.js',
  './js/domain/timer.js',
  './js/domain/validation.js',
  './js/modules/academics.js',
  './js/modules/dashboard-widgets.js',
  './js/modules/dashboard.js',
  './js/modules/focus.js',
  './js/modules/journal.js',
  './js/modules/performance.js',
  './js/modules/projects.js',
  './js/modules/settings.js',
  './js/modules/tasks.js',
  './js/router.js',
  './js/state.js',
  './js/utilities.js',
  './manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
