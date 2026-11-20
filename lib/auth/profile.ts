import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Auth profile lookup contract.
 *
 * `public.users` is the canonical application profile and the only place
 * authorization reads the role from. `public.profiles` is retained for
 * wallet-era and legacy fields; it is read here only as a compatibility
 * fallback when the canonical row does not exist yet.
 */
export const CANONICAL_PROFILE_TABLE = 'users' as const;
export const LEGACY_PROFILE_TABLE = 'profiles' as const;

export type AuthProfile = Record<string, unknown> & { id: string };
export type AuthProfileSource = typeof CANONICAL_PROFILE_TABLE | typeof LEGACY_PROFILE_TABLE;

export type AuthProfileLookup = {
  profile: AuthProfile | null;
  source: AuthProfileSource | null;
};

function isProfile(value: unknown): value is AuthProfile {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    typeof (value as { id?: unknown }).id === 'string'
  );
}

async function readProfile(
  supabase: SupabaseClient,
  table: AuthProfileSource,
  userId: string
): Promise<AuthProfile | null> {
  const { data, error } = await supabase.from(table).select('*').eq('id', userId).maybeSingle();

  if (error) {
    throw error;
  }

  return isProfile(data) ? data : null;
}

/**
 * Reads the signed-in user's profile without making the legacy table
 * authoritative. Canonical `users` always wins; `profiles` is consulted only
 * when the canonical row is absent (for example an older wallet account).
 */
export async function loadAuthProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<AuthProfileLookup> {
  if (!userId) {
    return { profile: null, source: null };
  }

  try {
    const canonical = await readProfile(supabase, CANONICAL_PROFILE_TABLE, userId);

    if (canonical) {
      return { profile: canonical, source: CANONICAL_PROFILE_TABLE };
    }
  } catch (error) {
    // A transient canonical read failure must not hide a readable legacy
    // profile. The caller still logs the failure through its own warning.
    if (typeof console !== 'undefined') {
      console.warn('Failed to fetch canonical profile, trying legacy profile:', error);
    }
  }

  try {
    const legacy = await readProfile(supabase, LEGACY_PROFILE_TABLE, userId);

    if (legacy) {
      return { profile: legacy, source: LEGACY_PROFILE_TABLE };
    }
  } catch (error) {
    if (typeof console !== 'undefined') {
      console.warn('Failed to fetch legacy profile:', error);
    }
  }

  return { profile: null, source: null };
}
