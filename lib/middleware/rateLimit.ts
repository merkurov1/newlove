import { NextRequest, NextResponse } from 'next/server';

// Configurable rate limiting
interface RateLimitConfig {
  maxRequests?: number;
  windowMs?: number;
  message?: string;
}

const ipMap = new Map<string, { count: number; last: number }>();

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of ipMap.entries()) {
    if (now - entry.last > 5 * 60 * 1000) {
      ipMap.delete(ip);
    }
  }
}, 5 * 60 * 1000);

export function withRateLimit(
  handler: Function,
  config: RateLimitConfig = {}
) {
  const {
    maxRequests = 60, // 60 requests per minute default
    windowMs = 60 * 1000, // 1 minute
    message = 'Too many requests, please try again later.',
  } = config;

  return async (req: NextRequest, ...args: any[]) => {
    const ip = req.headers.get('x-forwarded-for') || req.ip || 'unknown';
    const now = Date.now();
    const entry = ipMap.get(ip) || { count: 0, last: now };
    
    // Reset counter if window expired
    if (now - entry.last > windowMs) {
      entry.count = 0;
      entry.last = now;
    }
    
    entry.count++;
    ipMap.set(ip, entry);
    
    // Check if limit exceeded
    if (entry.count > maxRequests) {
      return NextResponse.json(
        { error: message },
        {
          status: 429,
          headers: {
            'Retry-After': Math.ceil((entry.last + windowMs - now) / 1000).toString(),
            'X-RateLimit-Limit': maxRequests.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': new Date(entry.last + windowMs).toISOString(),
          },
        }
      );
    }
    
    return handler(req, ...args);
  };
}

// Preset configurations
export const rateLimitPresets = {
  strict: { maxRequests: 10, windowMs: 60 * 1000 }, // 10 req/min
  moderate: { maxRequests: 60, windowMs: 60 * 1000 }, // 60 req/min
  relaxed: { maxRequests: 120, windowMs: 60 * 1000 }, // 120 req/min
  api: { maxRequests: 100, windowMs: 60 * 1000 }, // 100 req/min
};
