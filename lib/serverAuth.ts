// lib/serverAuth.ts

import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

type ServerAuthOptions = {
  useServiceRole?: boolean;
};

/**
 * Серверный клиент Supabase без сохранения сессии в cookies.
 * Используется фоновыми воркерами, кронами и служебными скриптами.
 */
export function getServerSupabaseClient(options: ServerAuthOptions = {}): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const preferServiceRole = !!options.useServiceRole;
  
  let supabaseKey: string | undefined;

  if (preferServiceRole) {
    supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  } else {
    supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
  }

  if (!supabaseUrl || !supabaseKey) {
    if (preferServiceRole && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY is required when useServiceRole=true in production');
      }
      supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
    }

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase env vars missing: NEXT_PUBLIC_SUPABASE_URL and key are required');
    }
  }

  return createSupabaseClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });
}

export interface AuthenticatedUser {
  id: string;
  email?: string;
  role: 'USER' | 'ADMIN';
  profile: any;
  user?: any;
}

/**
 * Получает текущего пользователя и его профиль из таблицы public.users
 * с использованием встроенных механизмов @supabase/ssr.
 */
export async function getCurrentUser(): Promise<any> {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error || !user) return null;

    const { data: profile } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    const role = (user.user_metadata?.role || profile?.role) === 'ADMIN' ? 'ADMIN' : 'USER';

    const result: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      role,
      profile,
    };
    // Совместимость для legacy кода, который вызывает (...).user.id
    result.user = result;

    return result;
  } catch (e) {
    return null;
  }
}

/**
 * Фолбек-функция для legacy-вызовов getServerUser
 */
export async function getServerUser(): Promise<any> {
  return getCurrentUser();
}

/**
 * Обязательная проверка авторизации
 */
export async function requireUser(): Promise<any> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');
  return user;
}

/**
 * Проверка прав администратора
 */
export async function requireAdmin(): Promise<any> {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    throw new Error('Unauthorized: Admin access required');
  }
  return user;
}

/**
 * Совместимость для вызовов requireAdminFromRequest
 */
export async function requireAdminFromRequest(req?: Request | null): Promise<any> {
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
