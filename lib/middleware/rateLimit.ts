import { NextRequest, NextResponse } from 'next/server';

const RATE_LIMIT = 10; // 10 requests
const WINDOW = 60 * 1000; // per minute
const ipMap = new Map<string, { count: number; last: number }>();

export function withRateLimit(handler: Function) {
  return async (req: NextRequest, ...args: any[]) => {
    const ip = req.headers.get('x-forwarded-for') || req.ip || 'unknown';
    const now = Date.now();
    const entry = ipMap.get(ip) || { count: 0, last: now };
    if (now - entry.last > WINDOW) {
      entry.count = 0;
      entry.last = now;
    }
    entry.count++;
    ipMap.set(ip, entry);
    if (entry.count > RATE_LIMIT) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }
    return handler(req, ...args);
  };
}
