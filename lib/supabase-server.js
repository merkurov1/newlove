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

// Backwards-compatible helper used across the app. Some bundles resolve to
// the compiled `.js` file instead of the `.ts` source which caused imports
// like `import { getUserAndSupabaseFromRequest } from '@/lib/supabase-server'`
// to fail during the production build. Provide a JS implementation here that
// mirrors the TypeScript helper so both ESM import styles work.
export async function getUserAndSupabaseFromRequest(req) {
  try {
    // If a Request object is provided, try to read its cookie header first.
    const cookieHeader = (req && req.headers && typeof req.headers.get === 'function')
      ? req.headers.get('cookie') || ''
      : '';

    // Fallback to Next's cookies() store if available
    const cookieStore = cookies();

    const cookiesObj = cookieHeader
      ? Object.fromEntries(
          cookieHeader
            .split(';')
            .map(s => {
              const [k, ...v] = s.split('=');
              return [k && k.trim(), decodeURIComponent((v || []).join('='))];
            })
            .filter(Boolean)
        )
      : {
          'sb-access-token': cookieStore.get('sb-access-token')?.value,
          'supabase-access-token': cookieStore.get('supabase-access-token')?.value,
        };

    const accessToken = cookiesObj['sb-access-token'] || cookiesObj['supabase-access-token'] || '';
    if (!accessToken) return { user: null, supabase: null };

    // Use the server-capable client that attaches cookies for SSR requests.
    const supabase = createClient();

    try {
      const { data: { user }, error } = await supabase.auth.getUser(accessToken);
      if (error) {
        console.error('Supabase getUser error', error);
        return { user: null, supabase };
      }
      return { user, supabase };
    } catch (e) {
      console.error('Error validating supabase token', e);
      return { user: null, supabase };
    }
  } catch (e) {
    console.error('getUserAndSupabaseFromRequest error', e);
    return { user: null, supabase: null };
  }
}

// Make the helper available as the default export too (some importers expect default)
export default getUserAndSupabaseFromRequest;
