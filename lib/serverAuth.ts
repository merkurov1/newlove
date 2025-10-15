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
  // When requesting a service-role client, require the SUPABASE_SERVICE_ROLE_KEY explicitly.
  // This prevents accidentally falling back to an anon key which leads to silent permission failures (42501).
  let supabaseKey: string | undefined;
  if (preferServiceRole) {
    supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  } else {
    supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
  }

  if (!supabaseUrl || !supabaseKey) {
    if (preferServiceRole && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is required when useServiceRole=true but is not configured in the environment');
    }
    throw new Error('Supabase env vars missing: NEXT_PUBLIC_SUPABASE_URL|SUPABASE_URL and a Supabase key are required');
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

  // First try direct metadata/role field
  const roleRaw = ((user as any).user_metadata as any)?.role || (user as any)?.role || null;
  const role = roleRaw ? String(roleRaw).toUpperCase() : null;
  if (role === 'ADMIN') return user;

  // Fallback: check user_roles via service role client
  try {
    const svc = getServerSupabaseClient({ useServiceRole: true });
    const resp = await (svc as any).from('user_roles').select('role_id,roles(name)').eq('user_id', user.id);
    if (!resp.error && Array.isArray(resp.data)) {
      const hasAdmin = resp.data.some((r: any) => {
        const roleList: any = r.roles;
        if (Array.isArray(roleList)) return roleList.some((roleObj: any) => String(roleObj.name).toUpperCase() === 'ADMIN');
        return String(roleList?.name).toUpperCase() === 'ADMIN';
      });
      if (hasAdmin) return user;
    }
  } catch (e) {
    // ignore and fallthrough to unauthorized
  }

  throw new Error('Unauthorized');
}

/**
 * Require admin, preferring request-based session validation if a Request
 * object is provided. Falls back to ADMIN_API_SECRET and finally to the
 * server-key-based check.
 */
export async function requireAdminFromRequest(req?: Request | null): Promise<any> {
  if (req) {
    let helperUser: any = null;
    try {
      const { getUserAndSupabaseFromRequestInterop } = await import('./supabaseInterop');
      const maybe = await getUserAndSupabaseFromRequestInterop(req as Request);
      helperUser = maybe?.user || null;
      if (helperUser?.id) {
        const role = (helperUser.user_metadata && helperUser.user_metadata.role) || helperUser.role || null;
        if (role && String(role).toUpperCase() === 'ADMIN') return helperUser;

        // Try service-role lookup for user_roles
        try {
          const svc = getServerSupabaseClient({ useServiceRole: true });
          const resp = await (svc as any).from('user_roles').select('role_id,roles(name)').eq('user_id', helperUser.id);
          if (!resp.error && Array.isArray(resp.data)) {
            const hasAdmin = resp.data.some((r: any) => {
              const roleList: any = r.roles;
              if (Array.isArray(roleList)) return roleList.some((roleObj: any) => String(roleObj.name).toUpperCase() === 'ADMIN');
              return String(roleList?.name).toUpperCase() === 'ADMIN';
            });
            if (hasAdmin) return helperUser;
          }
        } catch (e) {
          // ignore and continue to other checks
        }

        throw new Error('Not authorized');
      }
    } catch (e) {
      // Treat helper failures as unauthenticated and continue to other checks
      console.error('requireAdminFromRequest: getUserAndSupabaseFromRequestInterop failed', e);
    }

    // If helper didn't yield a user, attempt cookie reconstruction + service RPC fallback
    if (!helperUser?.id) {
      try {
        if (req && typeof req.headers?.get === 'function') {
          const cookieHeader = req.headers.get('cookie') || '';
          const res = (await import('./auth/tokenUtils')).default.extractTokenFromCookieHeader(cookieHeader);
          let accessToken = res.token || '';
          if (accessToken) {
            const normalized = (await import('./auth/tokenUtils')).default.normalizeToken(accessToken);
            const uid = (await import('./auth/tokenUtils')).default.decodeUidFromJwt(normalized);
            if (uid) {
              try {
                const svc = getServerSupabaseClient({ useServiceRole: true });
                try {
                  const rpcAny = await (svc as any).rpc('get_my_user_roles_any', { uid_text: uid });
                  if (!rpcAny?.error && Array.isArray(rpcAny.data) && rpcAny.data.length) {
                    const found = rpcAny.data.some((r: any) => {
                      if (!r) return false;
                      if (typeof r === 'string') return r.toUpperCase() === 'ADMIN';
                      const vals = Object.values(r).map((v: any) => String(v).toUpperCase());
                      return vals.includes('ADMIN');
                    });
                    if (found) {
                      return { id: uid, role: 'ADMIN' } as any;
                    }
                  }
                } catch (e2) {
                  // rpc missing or failed - fallback to direct select
                }

                const res2 = await (svc as any).from('user_roles').select('role_id,roles(name)').eq('user_id', uid);
                if (!res2.error && Array.isArray(res2.data)) {
                  const hasAdmin = res2.data.some((r: any) => {
                    const roleList: any = r.roles;
                    if (Array.isArray(roleList)) return roleList.some((roleObj: any) => String(roleObj.name).toUpperCase() === 'ADMIN');
                    return String(roleList?.name).toUpperCase() === 'ADMIN';
                  });
                  if (hasAdmin) return { id: uid, role: 'ADMIN' } as any;
                }
              } catch (e3) {
                // ignore fallback errors
              }
            }
          }
        }
      } catch (eFallback) {
        // ignore overall fallback failures
      }
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

