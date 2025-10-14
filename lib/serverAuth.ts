import { createClient, SupabaseClient } from '@supabase/supabase-js';

type ServerAuthOptions = {
  useServiceRole?: boolean; // explicit opt-in to service role key
};

/**
 * Create a Supabase client intended for server-only use.
 * By default this prefers NON-service keys (SUPABASE_KEY) unless explicitly
 * requested via options.useServiceRole. This avoids accidentally using
 * the service_role key in runtime paths that shouldn't have elevated privileges.
 */
export function getServerSupabaseClient(options: ServerAuthOptions = {}): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const preferServiceRole = !!options.useServiceRole;

  const supabaseKey = preferServiceRole
    ? process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
    : process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase env vars missing: NEXT_PUBLIC_SUPABASE_URL|SUPABASE_URL and SUPABASE_KEY (or SUPABASE_SERVICE_ROLE_KEY) are required');
  }

  return createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
}

/**
 * Try to retrieve the server user using the server Supabase client.
 * Returns null on any failure to avoid throwing from common server-side flows.
 */
export async function getServerUser(): Promise<any | null> {
  try {
    const supabase = getServerSupabaseClient();
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      // Treat missing-session as an expected condition during SSR/static builds
      // (Supabase may return AuthSessionMissingError when no cookie/token is present).
      const msg = (error && (error.message || error.name || '')).toString();
      if (msg.includes('Auth session missing') || msg.includes('AuthSessionMissing')) {
        // Keep this quiet in normal runs. If diagnostics are enabled, emit a debug line.
        if (process.env.METADATA_DIAG === 'true') {
          // eslint-disable-next-line no-console
          console.debug('getServerUser: no auth session present (expected during SSR):', msg);
        }
        return null;
      }

      console.error('getServerUser supabase.auth.getUser error', error);
      return null;
    }
    return (data as any)?.user || null;
  } catch (e) {
    console.error('getServerUser failed', e);
    return null;
  }
}

export async function requireUser(): Promise<any> {
  const user = await getServerUser();
  if (!user) throw new Error('Unauthorized');
  return user;
}

export async function requireAdmin(): Promise<any> {
  const user = await getServerUser();
  if (!user) throw new Error('Unauthorized');
  const role = ((user as any).user_metadata as any)?.role || (user as any)?.role || 'USER';
  if (role !== 'ADMIN') throw new Error('Unauthorized');
  return user;
}

/**
 * Require admin, preferring request-based session validation if a Request
 * object is provided. Falls back to ADMIN_API_SECRET and finally to the
 * server-key-based check.
 */
export async function requireAdminFromRequest(req?: Request | null): Promise<any> {
  if (req) {
    try {
      const { getUserAndSupabaseFromRequestInterop } = await import('./supabaseInterop');
      const maybe = await getUserAndSupabaseFromRequestInterop(req as Request);
      const user = maybe?.user || null;
      if (user?.id) {
        const role = (user.user_metadata && user.user_metadata.role) || user.role || 'USER';
        if (role === 'ADMIN') return user;
        throw new Error('Not authorized');
      }
    } catch (e) {
      // Treat helper failures as unauthenticated and continue to other checks
      console.error('requireAdminFromRequest: getUserAndSupabaseFromRequestInterop failed', e);
    }
  }

  // Admin API secret fallback (keeps CI/dev workflows compatible)
  if (process.env.ADMIN_API_SECRET) {
    return { id: 'server', role: 'ADMIN' } as any;
  }

  // Final fallback: use server-key-based check which throws if unauthorized
  return await requireAdmin();
}

// Provide a default export object to be resilient to different import styles
const serverAuthDefault = {
  getServerSupabaseClient,
  getServerUser,
  requireUser,
  requireAdmin,
  requireAdminFromRequest,
};

export default serverAuthDefault;

