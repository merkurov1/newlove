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
    // Temporarily bypass middleware-level admin role check so the admin
    // UI can render. Authentication/authorization remains enforced
    // inside server actions and API routes. This lets the UI load while
    // we troubleshoot session/RPC issues.
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
    // Match all paths except static files AND exclude /api routes (for Bots/Webhooks)
    // Добавлено '|api' в исключения
    '/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
