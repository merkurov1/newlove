import type { SupabaseClient } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/server';

export type SupaRequestResult = {
  supabase: SupabaseClient | null;
  user?: any | null;
  isServer?: boolean;
};

/**
 * Request-scoped Supabase access.
 *
 * This helper must never return a service-role client. Privileged operations
 * are required to call requireAdminFromRequest() first and then explicitly
 * create a service-role client for the narrow operation they need.
 */
export async function getUserAndSupabaseForRequest(
  req?: Request | null
): Promise<SupaRequestResult> {
  try {
    const supabase = createClient();
    const authorization = req?.headers?.get('authorization') || '';
    const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();

    const { data, error } = bearer
      ? await supabase.auth.getUser(bearer)
      : await supabase.auth.getUser();

    if (error) return { supabase, user: null, isServer: true };

    return { supabase, user: data.user ?? null, isServer: true };
  } catch {
    return { supabase: null, user: null, isServer: true };
  }
}

export default getUserAndSupabaseForRequest;
