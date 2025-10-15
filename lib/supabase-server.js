// lib/supabase-server.js
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
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

// Lightweight helper to get the current user from an App Router Request.
// Accepts the standard Request and reads cookies to validate the session
// using a centralized server-side Supabase client.
export async function getUserAndSupabaseFromRequest(req) {
  const cookieHeader = (req && req.headers && req.headers.get && req.headers.get('cookie')) || '';
  const cookiesObj = Object.fromEntries(
    cookieHeader
      .split(';')
      .map((s) => {
        const [k, ...v] = s.split('=');
        return [k && k.trim(), decodeURIComponent((v || []).join('='))];
      })
      .filter(Boolean)
  );

  let supabase = null;
  try {
    supabase = createClient();
  } catch (e) {
    console.error('Unable to create server supabase client', e);
    return { user: null, supabase: null };
  }

  const accessToken = cookiesObj['sb-access-token'] || cookiesObj['supabase-access-token'] || '';
  // Дополнительно поддерживаем передачу токена через заголовок Authorization: Bearer <token>
  const authHeader = (req && req.headers && req.headers.get && (req.headers.get('authorization') || req.headers.get('Authorization'))) || '';
  let finalAccessToken = '';
  if (authHeader && typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
    finalAccessToken = authHeader.slice(7).trim();
    // небольшая диагностика
    console.debug('supabase-server: using Authorization Bearer token from request header');
  }
  if (!finalAccessToken) finalAccessToken = accessToken;
  if (!finalAccessToken) {
    // Нет токена — публичный запрос, возвращаем supabase для публичных данных
    return { user: null, supabase };
  }

  try {
  // Передаём токен (из cookie или Authorization заголовка) в supabase.auth.getUser
  const { data: { user }, error } = await supabase.auth.getUser(finalAccessToken);
    if (error) {
      console.error('Supabase getUser error', error);
      return { user: null, supabase };
    }
    return { user, supabase };
  } catch (e) {
    console.error('Error validating supabase token', e);
    return { user: null, supabase };
  }
}

// Provide a default export as well for interop
export default getUserAndSupabaseFromRequest;
