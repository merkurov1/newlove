// ===== ФАЙЛ: lib/supabase/server.ts =====
// (ИСПРАВЛЕННАЯ ВЕРСИЯ)

import { createServerClient as _createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { SupabaseClient } from '@supabase/supabase-js';

type ServerClientOptions = {
  useServiceRole?: boolean;
};

export function createServerClient(
  cookieStore: ReturnType<typeof cookies>,
  options: ServerClientOptions = {}
) {
  
  // ----- ИЗМЕНЕНИЕ ЗДЕСЬ -----
  [span_0](start_span)// Ищем URL в обеих переменных, как это делал старый 'lib/serverAuth.ts'[span_0](end_span)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  // -------------------------

  let supabaseKey: string;

  const preferServiceRole = !!options.useServiceRole;

  if (preferServiceRole) {
    supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!supabaseKey) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is required when useServiceRole=true');
    }
  } else {
    supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  }

  // Добавляем проверку, что supabaseUrl нашелся
  if (!supabaseUrl) {
    throw new Error('Supabase URL not found. Please set NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL');
  }
  if (!supabaseKey) {
    throw new Error('Supabase key not found. Please set NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY)');
  }

  return _createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value
      },
      set(name: string, value: string, options: CookieOptions) {
        try { cookieStore.set({ name, value, ...options }) } catch (error) {}
      },
      remove(name: string, options: CookieOptions) {
        try { cookieStore.delete({ name, ...options }) } catch (error) {}
      },
    },
    ...(preferServiceRole && {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      }
    })
  });
}
