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

/**
 * Service-role / anonymous server client.
 */
export function getServerSupabaseClient(
  options: ServerAuthOptions = {},
): SupabaseClient {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;

  const useServiceRole = options.useServiceRole === true;

  const supabaseKey = useServiceRole
    ? process.env.SUPABASE_SERVICE_ROLE_KEY
    : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;

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
 * Валидация Telegram WebApp InitData
 */
function verifyTelegramWebAppData(telegramInitData: string): { userId: string } | null {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const allowedUserIds = (process.env.TELEGRAM_ALLOWED_USER_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (!botToken || !telegramInitData) return null;

  try {
    const urlParams = new URLSearchParams(telegramInitData);
    const hash = urlParams.get('hash');
    urlParams.delete('hash');

    const params: string[] = [];
    for (const [key, value] of urlParams.entries()) {
      params.push(`${key}=${value}`);
    }
    params.sort();

    const dataCheckString = params.join('\n');
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (calculatedHash !== hash) {
      return null;
    }

    const userParam = urlParams.get('user');
    if (!userParam) return null;

    const userData = JSON.parse(userParam);
    const userIdStr = String(userData.id);

    if (allowedUserIds.length > 0 && !allowedUserIds.includes(userIdStr)) {
      return null;
    }

    return { userId: userIdStr };
  } catch (err) {
    console.error('[serverAuth] Telegram initData verification error:', err);
    return null;
  }
}

/**
 * Get the current browser/server session user.
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
      console.error('[serverAuth] profile lookup failed:', profileError);
      return null;
    }

    const role = profile?.role === 'ADMIN' ? 'ADMIN' : 'USER';

    return {
      id: user.id,
      email: user.email,
      role,
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
 * Universal Admin Auth for Route Handlers:
 * Supports:
 * 1. Admin Secret Header (x-admin-secret) or Telegram Secret Token.
 * 2. Telegram Mini App InitData Header (x-telegram-init-data).
 * 3. Explicit Bearer Token (Authorization: Bearer <jwt>).
 * 4. Standard Browser SSR Cookie Session.
 */
export async function requireAdminFromRequest(
  req?: Request | null,
): Promise<AuthenticatedUser> {
  if (!req) {
    return requireAdmin();
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

  // 1. Проверка прямых админских заголовков или ключей сервиса
  const adminSecretHeader =
    req.headers.get('x-admin-secret') ||
    req.headers.get('x-telegram-bot-api-secret-token');

  if (
    adminSecretHeader &&
    ((serviceRoleKey && adminSecretHeader === serviceRoleKey) ||
      (webhookSecret && adminSecretHeader === webhookSecret))
  ) {
    return {
      id: 'system-admin',
      email: 'admin@merkurov.love',
      role: 'ADMIN',
      profile: { role: 'ADMIN' },
    };
  }

  // 2. Проверка авторизации Telegram Mini App (InitData)
  const telegramInitData = req.headers.get('x-telegram-init-data');
  if (telegramInitData) {
    const tgAuth = verifyTelegramWebAppData(telegramInitData);
    if (tgAuth) {
      return {
        id: `telegram-${tgAuth.userId}`,
        email: `tg-${tgAuth.userId}@telegram.org`,
        role: 'ADMIN',
        profile: { role: 'ADMIN', telegram_id: tgAuth.userId },
      };
    }
  }

  // 3. Проверка Bearer токена
  const authorization = req.headers.get('authorization');
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();

  if (token) {
    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const anonKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;

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

    const serviceClient = getServerSupabaseClient({ useServiceRole: true });
    const { data: profile, error: profileError } = await serviceClient
      .from('users')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      console.error('[serverAuth] bearer profile lookup failed:', profileError);
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

  // 4. Обычная куки-сессия браузера
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
