import { NextRequest, NextResponse } from 'next/server';

export function withHelmet(handler: Function) {
  return async (req: NextRequest, ...args: any[]) => {
    const res = await handler(req, ...args);
    if (res instanceof NextResponse) {
      res.headers.set('X-Frame-Options', 'SAMEORIGIN');
      res.headers.set('X-Content-Type-Options', 'nosniff');
      res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.headers.set('X-XSS-Protection', '1; mode=block');
      // Allow Umami analytics hosts so the analytics script can load in contexts
      res.headers.set(
        'Content-Security-Policy',
        "default-src 'self'; img-src * data:; script-src 'self' https://cloud.umami.is https://analytics.umami.is; style-src 'self' 'unsafe-inline';"
      );
    }
    return res;
  };
}
