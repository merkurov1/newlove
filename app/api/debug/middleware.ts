// app/api/debug/middleware.ts
import { NextResponse } from 'next/server';

/**
 * Middleware to disable debug endpoints in production
 * All /api/debug/* routes will return 404 in production
 */
export function middleware() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Not found' },
      { status: 404 }
    );
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: '/api/debug/:path*',
};
