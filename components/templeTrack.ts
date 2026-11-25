export async function templeTrack(eventType: string, message: string) {
  try {
    // Prefer the server-verified session. localStorage is only a display
    // fallback for anonymous visitors and never proves an identity.
    let displayName: string | null = null;

    if (typeof window !== 'undefined') {
      try {
        const res = await fetch('/api/temple/me');
        if (res.ok) {
          const j = await res.json();
          const verifiedName =
            typeof j?.displayName === 'string' ? j.displayName.trim() : '';

          if (verifiedName) {
            displayName = verifiedName;
            try { localStorage.setItem('temple_user', verifiedName); } catch {}
          }
        }
      } catch {
        // ignore
      }

      if (!displayName) {
        displayName = localStorage.getItem('temple_user') || null;
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
     
    console.warn('templeTrack failed', e)
  }
}
