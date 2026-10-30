import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';

type CookieToSet = {
  name: string;
  value: string;
  options?: CookieOptions;
};

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // Markdown twins: /path.md and `Accept: text/markdown` are served by the
  // /api/markdown converter. The internal header prevents a fetch loop.
  const wantsMarkdown =
    pathname.endsWith('.md') ||
    (request.headers.get('accept') || '').includes('text/markdown');

  if (
    wantsMarkdown &&
    !pathname.startsWith('/api') &&
    !pathname.startsWith('/_next') &&
    !request.headers.get('x-md-internal')
  ) {
    const target = pathname.endsWith('.md') ? pathname.slice(0, -3) || '/' : pathname;
    const url = request.nextUrl.clone();
    url.pathname = '/api/markdown';
    url.search = '';
    url.searchParams.set('path', target);
    if (searchParams.toString()) url.searchParams.set('query', searchParams.toString());
    return NextResponse.rewrite(url);
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },

        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          supabaseResponse = NextResponse.next({
            request,
          });

          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  await supabase.auth.getClaims();

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|xml|txt)$).*)',
  ],
};
