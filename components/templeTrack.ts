export async function templeTrack(eventType: string, message: string) {
  try {
    await fetch('/api/temple_logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_type: eventType, message })
    })
  } catch (e) {
    // don't throw — logging must not break UX
    // eslint-disable-next-line no-console
    console.warn('templeTrack failed', e)
  }
}
