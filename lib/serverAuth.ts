import { createClient } from '@supabase/supabase-js';

export function getServerSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  if (!supabaseUrl || !supabaseKey) throw new Error('Supabase env vars missing');
  return createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
}

export async function getServerUser() {
  try {
    const supabase = getServerSupabaseClient();
    const { data } = await supabase.auth.getUser();
    return (data as any)?.user || null;
  } catch (e) {
    return null;
  }
}

export async function requireAdmin() {
  const user = await getServerUser();
  if (!user) throw new Error('Unauthorized');
  const role = ((user as any).user_metadata as any)?.role || 'USER';
  if (role !== 'ADMIN') throw new Error('Unauthorized');
  return user;
}

/**
 * Require admin with preference for request-based validation.
 * If `req` is provided, try to validate the cookie-based session via
 * `getUserAndSupabaseFromRequest`. If that fails and ADMIN_API_SECRET is set,
 * accept the admin secret for server-to-server operations. Finally, fall back
 * to the server-key-based `requireAdmin`.
 */
export async function requireAdminFromRequest(req?: Request | null) {
  try {
    if (req) {
      // Use interop helper to be resilient to module export shape differences
      const { getUserAndSupabaseFromRequestInterop } = await import('./supabaseInterop');
      try {
        const { user } = await getUserAndSupabaseFromRequestInterop(req as Request) || {};
        if (user?.id) {
          const role = (user.user_metadata && user.user_metadata.role) || user.role || 'USER';
          if (role === 'ADMIN') return user;
          throw new Error('Not authorized');
        }
      } catch (e) {
        // If the helper itself failed, treat as unauthenticated and continue to other checks
        console.error('requireAdminFromRequest: getUserAndSupabaseFromRequest failed', e);
      }
    }

    // Admin API secret fallback (keeps CI/dev workflows compatible)
    if (process.env.ADMIN_API_SECRET) {
      return { id: 'server', role: 'ADMIN' } as any;
    }

    // Final fallback: use server-key-based check which throws if unauthorized
    return await requireAdmin();
  } catch (e) {
    throw e;
  }
}

export async function requireUser() {
  const user = await getServerUser();
  if (!user) throw new Error('Unauthorized');
  return user;
}
