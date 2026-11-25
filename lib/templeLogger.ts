import { supabase } from '@/lib/supabase-browser';
import { readPublicIdentityPreference } from '@/lib/temple/publicIdentity';

export type TempleEventType =
  | 'VIGIL' | 'VIGIL_SPARK' | 'ASH' | 'ABSOLUTION' | 'TRIBUTE'
  | 'MODAL_OPEN' | 'INTENSITY' | 'CAST' | 'WHISPER' | 'MEDITATION'
  | 'SILENCE' | 'HEARTANDANGEL';

interface LogParams {
  event_type: TempleEventType;
  message?: string;
  author?: string;
  metadata?: Record<string, unknown>;
}

export async function logTempleEvent({
  event_type,
  message = '',
  author,
  metadata = {}
}: LogParams) {
  // Prefer the author explicitly derived by the ritual. localStorage is only
  // a fallback for callers that do not have a live identity yet.
  const resolvedAuthor =
    typeof window !== 'undefined'
      ? author || localStorage.getItem('temple_user') || 'Pilgrim'
      : author || 'Pilgrim';

  try {
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch('/api/temple_logs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {})
      },
      keepalive: true,
      body: JSON.stringify({
        event_type,
        message,
        author: resolvedAuthor,
        // Explicit local consent only. Without it the server stores an
        // anonymous public trace even if a display name is available.
        show_identity: readPublicIdentityPreference(),
        metadata: {
          client: 'web_app',
          timestamp: new Date().toISOString(),
          ...metadata
        }
      })
    });
    if (!response.ok) {
      console.error(`Temple log request failed (${response.status})`);
      return false;
    }
    const result = await response.json().catch(() => null);
    return result?.ok === true;
  } catch (error) {
    console.error('Temple log error:', error);
    return false;
  }
}
