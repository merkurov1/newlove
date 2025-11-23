export async function templeTrack(eventType: string, message: string) {
  try {
    let displayName = typeof window !== 'undefined' ? (localStorage.getItem('temple_user') || null) : null;
    if (!displayName && typeof window !== 'undefined') {
      // Try server-side session as a fallback
      try {
        const res = await fetch('/api/temple/me');
        if (res.ok) {
          const j = await res.json();
          if (j?.displayName) {
            displayName = j.displayName;
            try { localStorage.setItem('temple_user', displayName); } catch (e) {}
          }
        }
      } catch (e) {
        // ignore
      }
    }

    const finalMessage = displayName ? `${displayName}: ${message}` : message;

    await fetch('/api/temple_logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_type: eventType, message: finalMessage })
    })
  } catch (e) {
    // don't throw — logging must not break UX
    // eslint-disable-next-line no-console
    console.warn('templeTrack failed', e)
  }
}
