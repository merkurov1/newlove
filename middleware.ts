import { NextRequest, NextResponse } from 'next/server';
import { addSecurityHeaders, addDevSecurityHeaders } from '@/lib/middleware/securityHeaders';

// Middleware to protect /admin routes server-side and add security headers.
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

        // Check various possible locations for service-backed RPC results.
        const rpcContainers = [body && body.rpc, body && body.debug && body.debug.rpc];
        for (const rpc of rpcContainers) {
          if (!rpc) continue;
          // Common naming: get_my_user_roles_any or get_my_user_roles_any_svc
          const candidates = ['get_my_user_roles_any_svc', 'get_my_user_roles_any', 'get_my_user_roles', 'get_my_roles'];
          for (const name of candidates) {
            if (rpc[name] && Array.isArray(rpc[name].data)) {
              const found = rpc[name].data.some((r: any) => {
                if (!r) return false;
                // support { role_name: 'ADMIN' }, { name: 'ADMIN' }, strings
                const vals = Object.values(r).map((v: any) => String(v || '').toUpperCase());
                return vals.includes('ADMIN');
              });
              if (found) return NextResponse.next();
            }
          }
        }
      }
    } catch (e) {
      // Log and continue rather than forcibly redirecting. Pages will render
      // server-side checks (requireAdminFromRequest) and can show a friendly 403.
      console.debug('middleware /admin role check failed (allowing page to handle):', e);
    }

    // Do not force a redirect here; let the page or API handle unauthorized state.
    const response = NextResponse.next();
    return process.env.NODE_ENV === 'production'
      ? addSecurityHeaders(response)
      : addDevSecurityHeaders(response);
  }

  // Add security headers to all responses
  const response = NextResponse.next();
  return process.env.NODE_ENV === 'production'
    ? addSecurityHeaders(response)
    : addDevSecurityHeaders(response);
}

export const config = {
  matcher: [
    // Match all paths except static files
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
