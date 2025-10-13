import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { getServerSupabaseClient } from '@/lib/serverAuth';
import type { NextApiRequest } from 'next';

// Lightweight wrapper to get the current user from Next.js route handlers.
// NOTE: In the app router, Request doesn't expose Next.js internals; we will
// accept a Headers-like object that contains cookies. For now we expose a
// helper that accepts a Request and returns { user, supabase }.

export async function getUserAndSupabaseFromRequest(req: Request) {
  // createServerSupabaseClient expects Next.js context; we can't call it
  // directly from the app router without adapter. As a pragmatic first step
  // we'll look for the Supabase access token cookie (by default name is
  // 'sb-access-token') and validate it via @supabase/supabase-js client.

  const cookieHeader = (req as any).headers?.get?.('cookie') || '';
  const cookies = Object.fromEntries(
    cookieHeader
      .split(';')
      .map((s: string) => {
        const [k, ...v] = s.split('=');
        return [k?.trim(), decodeURIComponent((v || []).join('='))];
      })
      .filter(Boolean)
  );

  const accessToken = cookies['sb-access-token'] || cookies['supabase-access-token'] || '';
  if (!accessToken) return { user: null, supabase: null };

  // Use centralized server client helper which reads the service role key.
  let supabase = null;
  try {
    supabase = getServerSupabaseClient();
  } catch (e) {
    console.error('Unable to create server supabase client', e);
    return { user: null, supabase: null };
  }

  try {
    // Fetch user by validating the JWT
    const {
      data: { user },
      error,
    } = (await supabase.auth.getUser(accessToken as string)) as any;
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

// (named export is provided by the function declaration above)
