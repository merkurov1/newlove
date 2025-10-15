import { NextRequest, NextResponse } from 'next/server';
import { requireAdminFromRequest } from './lib/serverAuth';

// Middleware to protect /admin routes server-side.
export async function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  // Only run for admin paths
  if (url.pathname.startsWith('/admin')) {
    try {
      // requireAdminFromRequest will throw if unauthorized
      await requireAdminFromRequest(request as any as Request);
      return NextResponse.next();
    } catch (e) {
      // Redirect unauthorized users to home or login
      url.pathname = '/403';
      return NextResponse.rewrite(url);
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/admin'],
};
