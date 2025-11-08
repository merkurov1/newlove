// lib/rateLimit.ts
import { NextResponse } from 'next/server';

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const store: RateLimitStore = {};

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  Object.keys(store).forEach((key) => {
    if (store[key].resetTime < now) {
      delete store[key];
    }
  });
}, 5 * 60 * 1000);

interface RateLimitOptions {
  interval: number; // milliseconds
  maxRequests: number;
  keyPrefix?: string;
}

/**
 * Rate limiter for API routes
 * @param identifier - Unique identifier (IP, email, user ID)
 * @param options - Rate limit configuration
 * @returns null if allowed, NextResponse with 429 if rate limited
 */
export function checkRateLimit(
  identifier: string,
  options: RateLimitOptions
): NextResponse | null {
  const { interval, maxRequests, keyPrefix = 'rl' } = options;
  const key = `${keyPrefix}:${identifier}`;
  const now = Date.now();

  // Initialize or get existing entry
  if (!store[key] || store[key].resetTime < now) {
    store[key] = {
      count: 1,
      resetTime: now + interval,
    };
    return null; // Allow request
  }

  // Increment count
  store[key].count++;

  // Check if exceeded
  if (store[key].count > maxRequests) {
    const retryAfter = Math.ceil((store[key].resetTime - now) / 1000);
    return NextResponse.json(
      {
        error: 'Too many requests',
        message: `Rate limit exceeded. Please try again in ${retryAfter} seconds.`,
        retryAfter,
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfter),
          'X-RateLimit-Limit': String(maxRequests),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(store[key].resetTime),
        },
      }
    );
  }

  return null; // Allow request
}

/**
 * Get client IP from request
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  
  if (realIp) {
    return realIp;
  }
  
  return 'unknown';
}

/**
 * Common rate limit configurations
 */
export const RATE_LIMITS = {
  NEWSLETTER: {
    interval: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5,
    keyPrefix: 'newsletter',
  },
  UPLOAD: {
    interval: 60 * 60 * 1000, // 1 hour
    maxRequests: 20,
    keyPrefix: 'upload',
  },
  API_DEFAULT: {
    interval: 60 * 1000, // 1 minute
    maxRequests: 60,
    keyPrefix: 'api',
  },
} as const;
