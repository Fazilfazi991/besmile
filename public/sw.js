const FALLBACK_ROUTE = '/employee/notifications';
const safeRoute = route => typeof route === 'string' && /^\/(employee|admin)(\/|$)/.test(route) && !route.startsWith('//') ? route : FALLBACK_ROUTE;

self.addEventListener('push', event => {
  console.log('[ServiceWorker] push received');
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
  const title = typeof payload.title === 'string' ? payload.title : 'BSmile CRM';
  console.log('[ServiceWorker] payload', payload);
  const body = typeof payload.body === 'string' ? payload.body : 'You have a new update.';
  const route = safeRoute(payload.route);
  console.log('[ServiceWorker] showing notification');
  event.waitUntil(self.registration.showNotification(title, { body, icon: '/images/bsmile-logo.png', badge: '/icons/bsmile-badge.svg', tag: typeof payload.tag === 'string' ? payload.tag : `bsmile-${payload.notificationId || 'update'}`, data: { route, notificationId: payload.notificationId || null }, requireInteraction: payload.requireInteraction === true, renotify: payload.priority === 'critical', timestamp: Number(payload.timestamp) || Date.now() }));
});

self.addEventListener('notificationclick', event => { event.notification.close(); const route = safeRoute(event.notification.data?.route); event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => { const existing = windows.find(client => client.url.includes(self.location.origin)); if (existing) return existing.focus().then(() => existing.navigate(route)); return clients.openWindow(route); })); });
self.addEventListener('notificationclose', () => {});
