// ===== ФАЙЛ: lib/supabase/server.ts =====
// (ПОЛНЫЙ ЧИСТЫЙ КОД С ИСПРАВЛЕНИЯМИ ТИПОВ)

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
// Мы убрали 'SupabaseClient', так как он вызывал ошибку GenericSchema

// Мы экспортируем функцию с именем 'createClient'
// ----- ИСПРАВЛЕНИЕ 2: Убираем ': SupabaseClient' отсюда,
// чтобы TypeScript сам определил правильный (более сложный) тип
export function createClient(options: { useServiceRole?: boolean } = {}) {
  const cookieStore = cookies();

  // ----- ИСПРАВЛЕНИЕ 1: Добавляем '!' в конце -----
  // '!' говорит TypeScript, что мы уверены, что эта переменная не 'undefined'
  // (потому что мы проверяем ее ниже)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (!supabaseUrl) {
    throw new Error("Missing env var: NEXT_PUBLIC_SUPABASE_URL");
  }

  let supabaseKey: string;

  if (options.useServiceRole) {
    // ----- ИСПРАВЛЕНИЕ 1: Добавляем '!' в конце -----
    supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!supabaseKey) {
      throw new Error("Missing env var: SUPABASE_SERVICE_ROLE_KEY");
    }
  } else {
    // ----- ИСПРАВЛЕНИЕ 1: Добавляем '!' в конце -----
    supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    if (!supabaseKey) {
      throw new Error("Missing env var: NEXT_PUBLIC_SUPABASE_ANON_KEY");
    }
  }

  // 'createServerClient' теперь получит 'string', а не 'string | undefined'
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
