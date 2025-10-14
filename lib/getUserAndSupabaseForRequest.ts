// lib/getUserAndSupabaseForRequest.ts
import type { SupabaseClient } from '@supabase/supabase-js';

export type SupaRequestResult = { supabase: SupabaseClient | null; user?: any | null; isServer?: boolean };

/**
 * Canonical wrapper that normalizes various export shapes of the supabase-server
 * helper. Pages and API routes should import this instead of importing
 * `@/lib/supabase-server` directly to avoid interop issues.
 */
export async function getUserAndSupabaseForRequest(req?: Request | null): Promise<SupaRequestResult> {
  try {
    const { getUserAndSupabaseFromRequestInterop } = await import('./supabaseInterop');
    const res = await getUserAndSupabaseFromRequestInterop(req as any);
    if (res && res.supabase) return { supabase: res.supabase, user: res.user || null, isServer: false };
  } catch (e) {
    // ignore and fallthrough to server fallback
  }

  try {
    const srv = await import('./serverAuth');
    const supabase = srv.getServerSupabaseClient();
    return { supabase, isServer: true } as SupaRequestResult;
  } catch (e) {
    // Emergency mock fallback to keep the site running if DB completely unavailable
    try {
      if (typeof process !== 'undefined' && process.env && process.env.EMERGENCY_SUPABASE_MOCK === 'true') {
        const { createMockSupabase } = await import('./mockSupabaseClient');
        const mock = createMockSupabase();
        return { supabase: mock as any, isServer: false };
      }
    } catch (e2) {
      // ignore
    }
    return { supabase: null, isServer: false };
  }
}

export default getUserAndSupabaseForRequest;
