import { NextRequest, NextResponse } from 'next/server';

// Middleware to protect /admin routes server-side.
// NOTE: running full server-side helpers from Edge middleware can be brittle
// (different runtimes, missing Node APIs). Instead, call the internal
// API `/api/user/role` which already performs a robust, service-role-backed
// check. We forward the request cookies so the API can resolve the session.
export async function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();

  // Only run for admin paths
  if (url.pathname.startsWith('/admin')) {
    try {
      const apiUrl = new URL('/api/user/role', request.url).toString();

      // Forward cookies so the API can read the session
      const res = await fetch(apiUrl, {
        headers: {
          cookie: request.headers.get('cookie') || '',
        },
        // don't cache this call
        next: { revalidate: 0 },
      });

      if (res.ok) {
        const body = await res.json().catch(() => ({}));
        const role = (body && body.role) || (body && body.user && body.user.role) || null;
        if (String(role || '').toUpperCase() === 'ADMIN') {
          return NextResponse.next();
        }

        // Some API responses may embed RPC results; check them conservatively
        if (body && body.rpc && body.rpc.get_my_user_roles_any_svc && Array.isArray(body.rpc.get_my_user_roles_any_svc.data)) {
          const found = body.rpc.get_my_user_roles_any_svc.data.some((r: any) => String(r.role_name || '').toUpperCase() === 'ADMIN');
          if (found) return NextResponse.next();
        }
      }
    } catch (e) {
      // Treat any failure as unauthorized for safety
      // (we could also allow on error, but that weakens protection)
    }

    // Redirect unauthorized users to /403
    url.pathname = '/403';
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/admin'],
};
