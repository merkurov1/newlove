import { assertServerOnly } from '@/lib/serverOnly';

assertServerOnly('lib/pierrot/rateLimit');

import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { checkRateLimit } from '@/lib/rateLimit';

export type PierrotRateLimitInput = {
  identifier: string;
  intervalMs: number;
  maxRequests: number;
  keyPrefix: string;
};

function createLimiterStore(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return null;

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

function bucketKey(input: PierrotRateLimitInput): string {
  return createHash('sha256')
    .update(`${input.keyPrefix}:${input.identifier}`, 'utf8')
    .digest('hex')
    .slice(0, 64);
}

function rateLimitedResponse(retryAfter: number, maxRequests: number): NextResponse {
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
        'X-RateLimit-Reset': String(Date.now() + retryAfter * 1000),
      },
    }
  );
}

/**
 * Cross-instance fixed-window limiter for Pierrot. The database RPC is atomic;
 * if it is unavailable, the existing in-memory limiter is used as a fallback.
 * Raw IPs and Telegram ids are hashed before they reach the database.
 */
export async function checkPierrotRateLimit(
  input: PierrotRateLimitInput
): Promise<NextResponse | null> {
  const store = createLimiterStore();
  const windowSeconds = Math.max(1, Math.ceil(input.intervalMs / 1000));

  if (store) {
    try {
      const { data, error } = await store.rpc('pierrot_rate_limit', {
        p_key: bucketKey(input),
        p_window_seconds: windowSeconds,
        p_max_requests: input.maxRequests,
      });

      if (!error) {
        const row = (Array.isArray(data) ? data[0] : data) as
          | { allowed?: unknown; retry_after?: unknown }
          | null;

        if (row && row.allowed === false) {
          const retryAfter = Number(row.retry_after);

          return rateLimitedResponse(
            Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : windowSeconds,
            input.maxRequests
          );
        }

        if (row && row.allowed === true) return null;
      }
    } catch {
      // Fall back to the instance-local limiter.
    }
  }

  return checkRateLimit(input.identifier, {
    interval: input.intervalMs,
    maxRequests: input.maxRequests,
    keyPrefix: input.keyPrefix,
  });
}
