// ===== ФАЙЛ: lib/supabase/server.ts =====
// (ИСПРАВЛЕННАЯ ВЕРСИЯ)

import { createServerClient as _createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
// Мы все еще можем импортировать SupabaseClient для использования
// в других местах, но он не нужен для сигнатуры функции.
import { SupabaseClient } from '@supabase/supabase-js'; 

// Этот HOC (Higher-Order Component) объединяет логику @supabase/ssr
// с вашей существующей логикой выбора service_role
// из старого файла lib/serverAuth.ts

type ServerClientOptions = {
  useServiceRole?: boolean;
};

export function createServerClient(
  cookieStore: ReturnType<typeof cookies>,
  options: ServerClientOptions = {}
) { // <-- ИЗМЕНЕНИЕ ЗДЕСЬ: я убрал ": SupabaseClient"
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
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

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase env vars missing: NEXT_PUBLIC_SUPABASE_URL and a Supabase key are required');
  }

  // Ошибка была здесь (строка 39 в твоем редакторе):
  // Функция _createServerClient возвращала тип, который
  // не соответствовал :SupabaseClient, который я указал выше.
  // Теперь TypeScript определит тип автоматически.
  return _createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value
      },
      set(name: string, value: string, options: CookieOptions) {
        // Этот try/catch нужен, т.к. Server Components read-only
        // и могут вызывать ошибку при попытке записать cookie
        try { cookieStore.set({ name, value, ...options }) } catch (error) {}
      },
      remove(name: string, options: CookieOptions) {
        // Аналогично
        try { cookieStore.delete({ name, ...options }) } catch (error) {}
      },
    },
    // Для service_role клиента отключаем сессии
    ...(preferServiceRole && {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      }
    })
  });
}
