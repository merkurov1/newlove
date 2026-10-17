// lib/serverAuth.ts

import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import crypto from 'crypto';

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

const TELEGRAM_INIT_DATA_MAX_AGE_SECONDS = 24 * 60 * 60;
const TELEGRAM_FUTURE_CLOCK_TOLERANCE_SECONDS = 60;

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
 * Verifies Telegram Mini App initData.
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

  const allowedUserIds = (
    process.env.TELEGRAM_ALLOWED_USER_IDS || ''
  )
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (
    !botToken ||
    !telegramInitData ||
    allowedUserIds.length === 0
  ) {
    return null;
  }

  try {
    const urlParams = new URLSearchParams(telegramInitData);
    const receivedHash = urlParams.get('hash');

    if (
      !receivedHash ||
      !/^[a-f0-9]{64}$/i.test(receivedHash)
    ) {
      return null;
    }

    // auth_date is mandatory and must be recent.
    const authDateRaw = urlParams.get('auth_date');

    if (!authDateRaw || !/^\d+$/.test(authDateRaw)) {
      return null;
    }

    const authDate = Number(authDateRaw);
    const now = Math.floor(Date.now() / 1000);

    if (
      !Number.isSafeInteger(authDate) ||
      authDate > now + TELEGRAM_FUTURE_CLOCK_TOLERANCE_SECONDS ||
      now - authDate > TELEGRAM_INIT_DATA_MAX_AGE_SECONDS
    ) {
      return null;
    }

    // Build the Telegram Web App data-check string.
    urlParams.delete('hash');

    const dataCheckString = Array.from(urlParams.entries())
      .map(([key, value]) => [key, value] as const)
      .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    // Telegram Web Apps signature verification.
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (!safeEqual(calculatedHash, receivedHash.toLowerCase())) {
      return null;
    }

    const userParam = urlParams.get('user');

    if (!userParam) {
      return null;
    }

    const userData = JSON.parse(userParam);

    if (
      !userData ||
      (typeof userData.id !== 'number' &&
        typeof userData.id !== 'string')
    ) {
      return null;
    }

    const userId = String(userData.id);

    if (!/^\d+$/.test(userId)) {
      return null;
    }

    // No allowlist means no Telegram Mini App administrator access.
    if (!allowedUserIds.includes(userId)) {
      return null;
    }

    return { userId };
  } catch (error) {
    console.error(
      '[serverAuth] Telegram initData verification failed.',
      error,
    );

    return null;
  }
}

/**
 * Resolves the authenticated user from the normal Supabase cookie session.
 */
export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  try {
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
      console.error(
        '[serverAuth] Profile lookup failed:',
        profileError,
      );

      return null;
    }

    return {
      id: user.id,
      email: user.email,
      role: profile?.role === 'ADMIN' ? 'ADMIN' : 'USER',
      profile,
      user,
    };
  } catch (error) {
    console.error('[serverAuth] getCurrentUser failed:', error);
    return null;
  }
}

export async function getServerUser(): Promise<AuthenticatedUser | null> {
  return getCurrentUser();
}

export async function requireUser(): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  return user;
}

export async function requireAdmin(): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();

  if (!user || user.role !== 'ADMIN') {
    throw new Error('Unauthorized: Admin access required');
  }

  return user;
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
      throw new Error('Unauthorized');
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
      throw new Error('Unauthorized: Admin access required');
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
  return requireAdmin();
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