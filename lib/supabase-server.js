// lib/supabase-server.js
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    // <<< ИЗМЕНЕНИЕ ЗДЕСЬ: Убедитесь, что переменная называется именно так
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    // <<< ГЛАВНОЕ ИЗМЕНЕНИЕ ЗДЕСЬ: Используем ANON_KEY вместо SERVICE_ROLE_KEY
    process.env.SUPABASE_ANON_KEY,
    {
      cookies: {
        get(name) {
          return cookieStore.get(name)?.value;
        },
        set(name, value, options) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch (error) {
            // Ошибка может возникать в Server Actions, это нормально
          }
        },
        remove(name, options) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch (error) {
            // Ошибка может возникать в Server Actions, это нормально
          }
        },
      },
    }
  );
}
