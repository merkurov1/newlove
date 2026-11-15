// Canonical server-side Supabase client factory.
//
// Next.js 16 removed synchronous access to `cookies()`. This factory is async
// and uses the `getAll`/`setAll` cookie adapter required by `@supabase/ssr`.
//
// Service-role clients never read or persist request cookies, so a user's anon
// session can never be attached to a privileged client.

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

type CookieToSet = { name: string; value: string; options?: CookieOptions };

export async function createClient(options: { useServiceRole?: boolean } = {}) {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  if (!supabaseUrl) {
    throw new Error('Missing env var: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL');
  }

  if (options.useServiceRole) {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!serviceKey) {
      throw new Error(
        'Missing env var: SUPABASE_SERVICE_ROLE_KEY (required for service role)'
      );
    }

    return createServerClient(supabaseUrl, serviceKey, {
      cookies: {
        getAll: () => [],
        setAll: () => {
          /* no-op for service role */
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!anonKey) {
    throw new Error('Missing env var: NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set({ name, value, ...options });
          });
        } catch {
          // Server Components cannot write cookies. Session refresh is handled
          // by the proxy/middleware and by Server Actions/Route Handlers.
        }
      },
    },
  });
}
