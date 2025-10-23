import { NextRequest, NextResponse } from 'next/server';

export function withHelmet(handler: Function) {
  return async (req: NextRequest, ...args: any[]) => {
    const res = await handler(req, ...args);
    if (res instanceof NextResponse) {
      res.headers.set('X-Frame-Options', 'SAMEORIGIN');
      res.headers.set('X-Content-Type-Options', 'nosniff');
      res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.headers.set('X-XSS-Protection', '1; mode=block');
      res.headers.set('Content-Security-Policy', "default-src 'self'; img-src * data:; script-src 'self'; style-src 'self' 'unsafe-inline';");
    }
    return res;
  };
}
