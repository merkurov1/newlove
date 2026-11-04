import type { SupabaseClient, User } from '@supabase/supabase-js';
import { assertServerOnly } from '@/lib/serverOnly';
import { verifySession } from '@/lib/session';

assertServerOnly('lib/vigil/identity');

export type VigilIdentity = {
  /** Stable, non-guessable cooldown key. Display names are never used. */
  key: string;
  userId: string;
  displayName: string;
  source: 'telegram' | 'supabase';
};

function readCookie(cookieHeader: string, name: string): string | null {
  const match = cookieHeader.match(new RegExp(`(?:^|; )${name}=([^;]+)`));

  if (!match) return null;

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

function displayNameFromUser(user: User, profileName?: string | null): string {
  return (
    profileName?.trim() ||
    (typeof user.user_metadata?.name === 'string'
      ? user.user_metadata.name.trim()
      : '') ||
    user.email?.split('@')[0]?.trim() ||
    ''
  );
}

/**
 * Resolves the two supported Vigil identities:
 *
 * 1. A signed Telegram `temple_session` cookie/token.
 * 2. A verified Supabase access token.
 *
 * Nothing supplied by the browser is trusted without signature verification.
 */
export async function resolveVigilIdentity(
  request: Request,
  supabaseAdmin: SupabaseClient,
  bodyToken?: string | null
): Promise<VigilIdentity | null> {
  const cookieHeader = request.headers.get('cookie') || '';
  const cookieToken = readCookie(cookieHeader, 'temple_session');
  const authHeader = request.headers.get('authorization') || '';
  const bearerToken = authHeader.match(/Bearer (.+)/)?.[1] || bodyToken || null;

  // A signed temple token may arrive as a bearer token or as the HttpOnly
  // cookie. Bearer-first preserves the previous API contract.
  const templeToken = bearerToken || cookieToken;

  if (templeToken) {
    const session = verifySession(templeToken);

    if (session?.userId) {
      const displayName = (session.displayName || '').trim().slice(0, 120);

      if (displayName) {
        return {
          key: `tg:${session.userId}`,
          userId: String(session.userId),
          displayName,
          source: 'telegram',
        };
      }
    }
  }

  // Web/email users authenticate with Supabase, not the Telegram session.
  if (bearerToken) {
    const {
      data: { user },
      error,
    } = await supabaseAdmin.auth.getUser(bearerToken);

    if (error) {
      console.error('vigil identity auth error:', error.message);
    } else if (user) {
      // AuthContext reads `profiles`; older code writes `users`. Prefer the
      // same table as the interface so the name is consistent.
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('name')
        .eq('id', user.id)
        .maybeSingle();

      let profileName =
        typeof profile?.name === 'string' ? profile.name : null;

      if (!profileName) {
        const { data: legacyUser } = await supabaseAdmin
          .from('users')
          .select('name')
          .eq('id', user.id)
          .maybeSingle();

        profileName =
          typeof legacyUser?.name === 'string' ? legacyUser.name : null;
      }

      const displayName = displayNameFromUser(user, profileName).slice(0, 120);

      if (displayName) {
        return {
          key: `sb:${user.id}`,
          userId: user.id,
          displayName,
          source: 'supabase',
        };
      }
    }
  }

  return null;
}
