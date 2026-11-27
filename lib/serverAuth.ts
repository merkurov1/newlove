// lib/serverAuth.ts

import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import crypto from 'crypto';
import { verifyTelegramInitData } from '@/lib/telegram/initData';
import { AuthenticationError, isAuthenticationError } from '@/lib/auth/errors';
import { logSecurityEvent } from '@/lib/logger';

export { AuthenticationError, isAuthenticationError };

type ServerAuthOptions = {
  useServiceRole?: boolean;
};

export type AuthProfileSource = 'users' | 'profiles';
export type AuthMethod = 'admin-secret' | 'telegram' | 'bearer' | 'session';

export interface AuthenticatedUser {
  id: string;
  email?: string;
  role: 'USER' | 'ADMIN';
  profile: any;
  user?: any;
  /**
   * Which table supplied the profile. `profiles` is only used as a legacy
   * compatibility fallback when the canonical `users` row is absent.
   */
  profileSource?: AuthProfileSource | null;
  /** Which credential path authorized this request. */
  authMethod?: AuthMethod;
}

const CANONICAL_PROFILE_TABLE = 'users' as const;
const LEGACY_PROFILE_TABLE = 'profiles' as const;

/**
 * Canonical roles are USER/ADMIN, but older rows may contain mixed casing or
 * whitespace. Normalising here keeps an existing administrator from being
 * silently downgraded by a cosmetic value mismatch.
 */
export function normalizeRole(value: unknown): 'USER' | 'ADMIN' {
  return typeof value === 'string' && value.trim().toUpperCase() === 'ADMIN' ? 'ADMIN' : 'USER';
}

type ProfileLookup = {
  profile: any | null;
  source: AuthProfileSource | null;
};

/**
 * Reads the canonical profile and falls back to the legacy `profiles` table
 * only when the canonical row does not exist. Errors from the canonical table
 * are propagated so database failures remain application errors (500), not
 * authentication denials (401).
 */
async function readProfile(client: SupabaseClient, userId: string): Promise<ProfileLookup> {
  const canonical = await client
    .from(CANONICAL_PROFILE_TABLE)
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (canonical.error) {
    throw canonical.error instanceof Error
      ? canonical.error
      : new Error(
          `Failed to load user profile: ${
            typeof canonical.error === 'object' &&
            canonical.error !== null &&
            'message' in canonical.error
              ? String((canonical.error as { message?: unknown }).message)
              : 'database error'
          }`
        );
  }

  if (canonical.data) {
    return { profile: canonical.data, source: 'users' };
  }

  const legacy = await client.from(LEGACY_PROFILE_TABLE).select('*').eq('id', userId).maybeSingle();

  if (legacy.error) {
    // The legacy table may not exist in newer deployments. A missing canonical
    // row with no readable legacy row simply means "ordinary user".
    return { profile: null, source: null };
  }

  return {
    profile: legacy.data ?? null,
    source: legacy.data ? 'profiles' : null,
  };
}

/**
 * Resolves the role with a privileged server-side client after the session
 * itself has already been validated by Supabase.
 *
 * The browser session is validated with the cookie-bound anon client, but the
 * role lookup must not depend on `users` RLS/grants: a policy regression would
 * otherwise turn a real administrator into an anonymous visitor (the reported
 * `auth_denied reason=admin` 401). This mirrors the Bearer-token path, which
 * already uses the service-role client for the profile read.
 */
async function readProfileForSession(
  sessionClient: SupabaseClient,
  userId: string
): Promise<ProfileLookup> {
  let client = sessionClient;

  // Avoid a warning on every request in deployments that intentionally do not
  // configure a service-role key. The session-bound client remains a safe,
  // policy-respecting fallback.
  if (!(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()) {
    return readProfile(sessionClient, userId);
  }

  try {
    client = getServerSupabaseClient({ useServiceRole: true });
  } catch (error) {
    console.warn(
      '[serverAuth] Service-role profile lookup unavailable; using session client:',
      error instanceof Error ? error.message : error
    );
  }

  return readProfile(client, userId);
}

/**
 * Constant-time comparison for secrets of equal length.
 */
function safeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a, 'utf8');
  const bBuffer = Buffer.from(b, 'utf8');

  if (aBuffer.length === 0 || aBuffer.length !== bBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

/**
 * Creates a server-side Supabase client.
 *
 * Service-role access must remain server-side and must never be
 * accepted as an HTTP authentication credential.
 */
export function getServerSupabaseClient(options: ServerAuthOptions = {}): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;

  const useServiceRole = options.useServiceRole === true;

  const supabaseKey = useServiceRole
    ? process.env.SUPABASE_SERVICE_ROLE_KEY
    : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      useServiceRole
        ? 'Missing Supabase service-role environment variables.'
        : 'Missing Supabase environment variables.'
    );
  }

  return createSupabaseClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

/**
 * Verifies Telegram Mini App initData with the shared server verifier.
 *
 * Access is denied when:
 * - the bot token is missing;
 * - the initData signature is invalid;
 * - auth_date is missing or stale;
 * - the Telegram user is not in the explicit allowlist.
 */
function verifyTelegramWebAppData(telegramInitData: string): { userId: string } | null {
  const botToken =
    process.env.PIERROT_BOT_TOKEN || process.env.OSIRIS_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;

  const allowedUserIds = (process.env.TELEGRAM_ALLOWED_USER_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (!botToken || allowedUserIds.length === 0) return null;

  const verified = verifyTelegramInitData(telegramInitData, botToken);

  if (!verified.ok) return null;

  // No allowlist means no Telegram Mini App administrator access.
  if (!allowedUserIds.includes(verified.user.id)) return null;

  return { userId: verified.user.id };
}

/**
 * Reads the current user's profile.
 *
 * A missing/invalid session is represented by `null`. A database failure while
 * reading the profile is thrown so callers can report it as an application
 * error (500) instead of disguising it as an authentication denial (401).
 */
async function loadCurrentUser(): Promise<AuthenticatedUser | null> {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  const { profile, source } = await readProfileForSession(supabase, user.id);

  return {
    id: user.id,
    email: user.email,
    role: normalizeRole(profile?.role),
    profile,
    user,
    profileSource: source,
  };
}

/**
 * Resolves the authenticated user from the normal Supabase cookie session.
 *
 * This remains best-effort for optional-auth surfaces: profile/database errors
 * are logged as application errors and treated as an anonymous visitor here.
 * Authorization gates use the strict variant below so those failures surface
 * as 500 responses.
 */
export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  try {
    return await loadCurrentUser();
  } catch (error) {
    console.error('[serverAuth] getCurrentUser failed:', error);
    return null;
  }
}

export async function getServerUser(): Promise<AuthenticatedUser | null> {
  return getCurrentUser();
}

function requestPath(req?: Request | null): string | undefined {
  if (!req) return undefined;

  try {
    return new URL(req.url).pathname;
  } catch {
    return req.url;
  }
}

function requestAuthDiagnostics(req?: Request | null) {
  const cookieHeader = req?.headers.get('cookie') || '';

  return {
    method: req?.method,
    path: requestPath(req),
    // Booleans only: never copy cookie values or tokens into logs.
    hasCookieHeader: cookieHeader.length > 0,
    hasSupabaseSessionCookie: /(?:^|;\s*)sb-[^=;]+-auth-token(?:\.\d+)?=/.test(cookieHeader),
  };
}

function logAuthDenied(
  reason: 'session' | 'user' | 'admin' | 'bearer' | 'bearer-role',
  req?: Request | null,
  details: Record<string, unknown> = {}
): void {
  logSecurityEvent('auth_denied', 'low', {
    reason,
    ...requestAuthDiagnostics(req),
    ...details,
  });
}

async function loadRequiredUser(): Promise<AuthenticatedUser | null> {
  try {
    return await loadCurrentUser();
  } catch (error) {
    // Real database/internal failures must be visible as application errors.
    console.error('[serverAuth] Failed to resolve current user:', error);
    throw error;
  }
}

export async function requireUser(): Promise<AuthenticatedUser> {
  const user = await loadRequiredUser();

  if (!user) {
    logAuthDenied('user');
    throw new AuthenticationError('Unauthorized', {
      code: 'auth_session_missing',
      reason: 'user',
    });
  }

  return user;
}

export async function requireAdmin(): Promise<AuthenticatedUser> {
  return requireAdminWithContext();
}

async function requireAdminWithContext(req?: Request | null): Promise<AuthenticatedUser> {
  const user = await loadRequiredUser();

  if (!user) {
    // A missing/expired cookie session is distinct from a signed-in account
    // without the ADMIN role. Conflating them was the reason the production
    // log only said `reason=admin` and could not guide the owner.
    logAuthDenied('session', req, {
      authenticated: false,
    });
    throw new AuthenticationError('Unauthorized: Admin access required', {
      code: 'auth_session_missing',
      reason: 'session',
    });
  }

  if (user.role !== 'ADMIN') {
    logAuthDenied('admin', req, {
      authenticated: true,
      userId: user.id,
      role: user.role,
      profileSource: user.profileSource ?? null,
    });
    throw new AuthenticationError('Unauthorized: Admin access required', {
      code: 'auth_admin_required',
      reason: 'admin',
    });
  }

  return { ...user, authMethod: 'session' };
}

/**
 * Central administrator authentication for API route handlers.
 *
 * Supported methods:
 * 1. Dedicated ADMIN_API_SECRET via x-admin-secret.
 * 2. Verified Telegram Mini App initData from an allowlisted user.
 * 3. A valid Supabase Bearer JWT belonging to an ADMIN.
 * 4. A standard Supabase browser cookie session belonging to an ADMIN.
 *
 * TELEGRAM_WEBHOOK_SECRET and SUPABASE_SERVICE_ROLE_KEY are deliberately
 * not accepted as general-purpose administrator credentials.
 */
export async function requireAdminFromRequest(req?: Request | null): Promise<AuthenticatedUser> {
  if (!req) {
    return requireAdmin();
  }

  // 1. Dedicated administrator secret.
  const adminSecret = process.env.ADMIN_API_SECRET;
  const suppliedAdminSecret = req.headers.get('x-admin-secret');

  if (adminSecret && suppliedAdminSecret && safeEqual(suppliedAdminSecret, adminSecret)) {
    return {
      id: 'system-admin',
      email: 'admin@merkurov.love',
      role: 'ADMIN',
      profile: { role: 'ADMIN' },
      authMethod: 'admin-secret',
    };
  }

  // 2. Telegram Mini App.
  const telegramInitData = req.headers.get('x-telegram-init-data');

  if (telegramInitData) {
    const telegramUser = verifyTelegramWebAppData(telegramInitData);

    if (telegramUser) {
      return {
        id: `telegram-${telegramUser.userId}`,
        email: `tg-${telegramUser.userId}@telegram.org`,
        role: 'ADMIN',
        profile: {
          role: 'ADMIN',
          telegram_id: telegramUser.userId,
        },
        authMethod: 'telegram',
      };
    }
  }

  // 3. Supabase Bearer JWT.
  const authorization = req.headers.get('authorization');
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();

  if (token) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;

    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;

    if (!supabaseUrl || !anonKey) {
      throw new Error('Missing Supabase URL or publishable key.');
    }

    const authClient = createSupabaseClient(supabaseUrl, anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });

    const {
      data: { user },
      error,
    } = await authClient.auth.getUser(token);

    if (error || !user) {
      logAuthDenied('bearer', req, { authenticated: false });
      throw new AuthenticationError('Unauthorized', {
        code: 'auth_bearer_invalid',
        reason: 'bearer',
      });
    }

    // Read the role with a server-side client.
    const serviceClient = getServerSupabaseClient({
      useServiceRole: true,
    });

    const { profile, source } = await readProfile(serviceClient, user.id);

    if (normalizeRole(profile?.role) !== 'ADMIN') {
      logAuthDenied('bearer-role', req, {
        authenticated: true,
        userId: user.id,
        role: normalizeRole(profile?.role),
        profileSource: source,
      });
      throw new AuthenticationError('Unauthorized: Admin access required', {
        code: 'auth_admin_required',
        reason: 'bearer-role',
      });
    }

    return {
      id: user.id,
      email: user.email,
      role: 'ADMIN',
      profile,
      user,
      profileSource: source,
      authMethod: 'bearer',
    };
  }

  // 4. Standard browser session.
  return requireAdminWithContext(req);
}

const serverAuthDefault = {
  getServerSupabaseClient,
  getCurrentUser,
  getServerUser,
  requireUser,
  requireAdmin,
  requireAdminFromRequest,
};

export default serverAuthDefault;
