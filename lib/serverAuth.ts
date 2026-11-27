// lib/serverAuth.ts

import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import crypto from 'crypto';
import { verifyTelegramInitData } from '@/lib/telegram/initData';
import { AuthenticationError, isAuthenticationError } from '@/lib/auth/errors';
import { logSecurityEvent } from '@/lib/logger';

export { AuthenticationError, isAuthenticationError };

type ServerAuthOptions = {
  useServiceRole?: boolean;
};

export interface AuthenticatedUser {
  id: string;
  email?: string;
  role: 'USER' | 'ADMIN';
  profile: any;
  user?: any;
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
export function getServerSupabaseClient(
  options: ServerAuthOptions = {},
): SupabaseClient {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL;

  const useServiceRole = options.useServiceRole === true;

  const supabaseKey = useServiceRole
    ? process.env.SUPABASE_SERVICE_ROLE_KEY
    : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      useServiceRole
        ? 'Missing Supabase service-role environment variables.'
        : 'Missing Supabase environment variables.',
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
function verifyTelegramWebAppData(
  telegramInitData: string,
): { userId: string } | null {
  const botToken =
    process.env.PIERROT_BOT_TOKEN ||
    process.env.OSIRIS_BOT_TOKEN ||
    process.env.TELEGRAM_BOT_TOKEN;

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

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    throw new Error(
      `Failed to load user profile: ${
        profileError instanceof Error
          ? profileError.message
          : 'database error'
      }`,
    );
  }

  return {
    id: user.id,
    email: user.email,
    role: profile?.role === 'ADMIN' ? 'ADMIN' : 'USER',
    profile,
    user,
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

type AuthDenialCause =
  | 'no_session'
  | 'profile_missing'
  | 'role_not_admin'
  | 'invalid_bearer';

function logAuthDenied(
  reason: 'user' | 'admin' | 'bearer' | 'bearer-role',
  req?: Request | null,
  cause?: AuthDenialCause,
): void {
  logSecurityEvent('auth_denied', 'low', {
    reason,
    ...(cause ? { cause } : {}),
    method: req?.method,
    path: requestPath(req),
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
    throw new AuthenticationError('Unauthorized');
  }

  return user;
}

export async function requireAdmin(): Promise<AuthenticatedUser> {
  return requireAdminWithContext();
}

async function loadServiceRoleProfile(userId: string): Promise<Record<string, unknown> | null> {
  const serviceClient = getServerSupabaseClient({ useServiceRole: true });
  const { data, error } = await serviceClient
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw new Error('Failed to verify administrator role.');
  }

  return (data as Record<string, unknown> | null) ?? null;
}

async function requireAdminWithContext(
  req?: Request | null,
): Promise<AuthenticatedUser> {
  const user = await loadRequiredUser();

  if (!user) {
    logAuthDenied('admin', req, 'no_session');
    throw new AuthenticationError('Unauthorized: Admin access required');
  }

  if (user.role === 'ADMIN') {
    return user;
  }

  // The browser-session path reads the profile through the user-scoped
  // (RLS) client. If the row is hidden or not materialised yet, an
  // authenticated owner would look like an ordinary visitor. Re-check the
  // authoritative role with the server-only client by the already-verified
  // user id; a missing row still denies access.
  if (!user.profile) {
    try {
      const profile = await loadServiceRoleProfile(user.id);

      if (profile?.role === 'ADMIN') {
        return { ...user, role: 'ADMIN', profile };
      }
    } catch (error) {
      // Expected authorization denials must not become 500s. A failed role
      // lookup is still a denial, and the server-side detail is not exposed.
      console.error('[serverAuth] admin role re-check failed:', error);
    }
  }

  logAuthDenied(
    'admin',
    req,
    user.profile ? 'role_not_admin' : 'profile_missing',
  );
  throw new AuthenticationError('Unauthorized: Admin access required');
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
export async function requireAdminFromRequest(
  req?: Request | null,
): Promise<AuthenticatedUser> {
  if (!req) {
    return requireAdmin();
  }

  // 1. Dedicated administrator secret.
  const adminSecret = process.env.ADMIN_API_SECRET;
  const suppliedAdminSecret = req.headers.get('x-admin-secret');

  if (
    adminSecret &&
    suppliedAdminSecret &&
    safeEqual(suppliedAdminSecret, adminSecret)
  ) {
    return {
      id: 'system-admin',
      email: 'admin@merkurov.love',
      role: 'ADMIN',
      profile: { role: 'ADMIN' },
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
      };
    }
  }

  // 3. Supabase Bearer JWT.
  const authorization = req.headers.get('authorization');
  const token = authorization
    ?.match(/^Bearer\s+(.+)$/i)?.[1]
    ?.trim();

  if (token) {
    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.SUPABASE_URL;

    const anonKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_KEY;

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
      logAuthDenied('bearer', req, 'invalid_bearer');
      throw new AuthenticationError('Unauthorized');
    }

    // Read the role with a server-side client.
    const serviceClient = getServerSupabaseClient({
      useServiceRole: true,
    });

    const { data: profile, error: profileError } = await serviceClient
      .from('users')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      console.error(
        '[serverAuth] Bearer profile lookup failed:',
        profileError,
      );

      throw new Error('Failed to verify administrator role.');
    }

    if (profile?.role !== 'ADMIN') {
      logAuthDenied('bearer-role', req, 'role_not_admin');
      throw new AuthenticationError('Unauthorized: Admin access required');
    }

    return {
      id: user.id,
      email: user.email,
      role: 'ADMIN',
      profile,
      user,
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