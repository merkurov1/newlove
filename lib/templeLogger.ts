type TempleEventType = 'VIGIL' | 'ASH' | 'ABSOLUTION' | 'TRIBUTE' | 'MODAL_OPEN' | 'INTENSITY';

interface LogParams {
  event_type: TempleEventType;
  message?: string;
  author?: string;
  metadata?: Record<string, any>;
}

export async function logTempleEvent({
  event_type,
  message = '',
  author,
  metadata = {}
}: LogParams) {
  // Единое разрешение имени: localStorage -> переданный author -> дефолт 'Pilgrim'
  const resolvedAuthor = typeof window !== 'undefined' 
    ? (localStorage.getItem('temple_user') || author || 'Pilgrim')
    : (author || 'Pilgrim');

  try {
    await fetch('/api/temple_logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type,
        message,
        author: resolvedAuthor,
        metadata: {
          client: 'web_app',
          timestamp: new Date().toISOString(),
          ...metadata
        }
      })
    });
  } catch (error) {
    console.error('Temple log error:', error);
  }
}
