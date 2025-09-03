// Fires a lightweight notification when a user views the site.
// Uses sessionStorage to avoid duplicate pings per tab session.
(function notifyOnViewOnce() {
  try {
    if (sessionStorage.getItem('notified-view') === '1') return;
    sessionStorage.setItem('notified-view', '1');

    const payload = {
      path: location.pathname + location.search,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      lang: navigator.language || navigator.userLanguage || 'en'
    };

    // Non-blocking fire-and-forget
    fetch('/notify-view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
      credentials: 'same-origin'
    }).catch(() => { /* ignore */ });
  } catch (_) { /* ignore */ }
})();

