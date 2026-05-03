self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  const options = {
    body: data.body || 'Nuevo mensaje',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'guerrero-msg',
    requireInteraction: true,
    silent: false,
    vibrate: [200, 100, 200],
    data: { leadId: data.leadId, url: '/chat' }
  };
  event.waitUntil(
    self.registration.showNotification(data.title || '⚔️ Guerrero AI', options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const leadId = event.notification.data?.leadId;
  const url = leadId ? `/chat?lead=${leadId}` : '/chat';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes('/chat') && 'focus' in client) {
          client.postMessage({ type: 'OPEN_LEAD', leadId });
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
