// ===== ФАЙЛ: lib/supabase/server.ts =====
// (ПОЛНЫЙ ЧИСТЫЙ КОД С ИСПРАВЛЕНИЯМИ ТИПОВ)

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
// Мы убрали 'SupabaseClient', так как он вызывал ошибку GenericSchema

// Мы экспортируем функцию с именем 'createClient'
// ----- ИСПРАВЛЕНИЕ 2: Убираем ': SupabaseClient' отсюда,
// чтобы TypeScript сам определил правильный (более сложный) тип
export function createClient(options: { useServiceRole?: boolean } = {}) {
  // For service-role usage we don't want to read or persist request cookies
  // (this ensures we don't accidentally attach a user's anon session to the
  // service-role client). Provide a no-op cookie store in that case.
  const cookieStore = options.useServiceRole
    ? {
        // match `cookies()` shape: get(name) returns undefined or { value }
        get(_name: string) {
          return undefined;
        },
        // cookies().set expects a single object parameter { name, value, ...options }
        set(_cookie: { name: string; value: string } & Partial<CookieOptions>) {
          /* no-op for service role */
        },
        // cookies().delete / cookieStore.delete expects an object parameter
        delete(_cookie: { name: string } & Partial<CookieOptions>) {
          /* no-op for service role */
        },
      }
    : cookies();

  // Safely read env vars and return clear errors instead of relying on '!'
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  if (!supabaseUrl) {
    throw new Error('Missing env var: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL');
  }

  let supabaseKey: string;
  if (options.useServiceRole) {
    supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!supabaseKey) {
      throw new Error('Missing env var: SUPABASE_SERVICE_ROLE_KEY (required for service role)');
    }
  } else {
    supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    if (!supabaseKey) {
      throw new Error('Missing env var: NEXT_PUBLIC_SUPABASE_ANON_KEY');
    }
  }

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch (error) { }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.delete({ name, ...options });
        } catch (error) { }
      },
    },
    // Отключаем auth для service role
    ...(options.useServiceRole && {
      auth: { persistSession: false }
    })
  });
}
