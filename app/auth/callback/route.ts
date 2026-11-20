import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { safeLoginReturnPath } from '@/lib/auth/returnPath';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = safeLoginReturnPath(searchParams.get('next')) ?? '/profile';

  if (code && !searchParams.get('error')) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set({ name, value, ...options });
            });
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  // /login owns the retry UI and offers all four sign-in methods. The old
  // /auth/auth-code-error path did not exist and produced a 404 dead end.
  const failure = new URL('/login', origin);
  failure.searchParams.set('error', 'callback');
  failure.searchParams.set('next', next);

  return NextResponse.redirect(failure);
}
